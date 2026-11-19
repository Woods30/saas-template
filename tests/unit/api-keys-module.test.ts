import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `userFeatures.apiKeys` 门禁：该功能开关关闭时，`/api/auth/api-key/*`
 * 必须 404 且不进 better-auth handler，否则用户能绕过 UI 直接建 key。
 */

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ apiKeys: [] })),
  getAuth: vi.fn(),
}))

vi.mock('@/core/auth/auth', () => ({
  getAuth: (...args: unknown[]) => {
    mocks.getAuth(...args)
    return { handler: mocks.handler }
  },
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: { RESEND_API_KEY: 're_synthetic', MAIL_FROM: 'test@example.com' },
  }),
  als: {
    getStore: () => ({ env: { RESEND_API_KEY: 're_synthetic', MAIL_FROM: 'test@example.com' } }),
  },
}))

type Handler = (ctx: { request: Request }) => Promise<Response>

function getHandler(route: unknown, method: 'GET' | 'POST'): Handler {
  const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
    .options?.server?.handlers
  const handler = handlers?.[method]
  if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
  return handler as Handler
}

/** 用覆盖后的 websiteConfig 重新导入 auth 路由。 */
async function importAuthRouteWithFeatures(userFeatures: {
  apiKeys: boolean
}): Promise<{ Route: unknown }> {
  vi.resetModules()
  vi.doMock('@/config/website', async () => {
    const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
    const { parsePublicEnv } =
      await vi.importActual<typeof import('@/core/env/public')>('@/core/env/public')
    const base = actual.createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
    return {
      ...actual,
      websiteConfig: {
        ...base,
        userFeatures: { ...base.userFeatures, ...userFeatures },
      },
    }
  })
  return import('@/routes/api/auth/$')
}

describe('userFeatures.apiKeys 门禁', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('apiKeys 关闭时 GET /api/auth/api-key/list 返回 404，且不进入 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ apiKeys: false })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/api-key/list'),
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('apiKeys 关闭时 POST /api/auth/api-key/create 返回 404，且不进入 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ apiKeys: false })
    const handler = getHandler(Route, 'POST')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/api-key/create', {
        method: 'POST',
        body: '{}',
      }),
    })
    expect(res.status).toBe(404)
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('apiKeys 关闭不影响非 api-key 的 auth 端点', async () => {
    const { Route } = await importAuthRouteWithFeatures({ apiKeys: false })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/session'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })

  it('apiKeys 开启时 api-key 端点放行到 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ apiKeys: true })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/api-key/list'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })
})

/**
 * 管理插件端点（`/api/auth/admin/*`）的权限点门禁。
 *
 * 插件自己按 `users.role` 判定，而 RBAC 把该列同步成「是否持有任意 admin.*
 * 权限」的粗粒度标记——只读的 `viewer` 也是 `admin`。因此进 handler 之前必须
 * 按**具体权限点**再拦一道，否则只读账号能改角色 / 封禁 / 模拟登录。
 */
describe('管理插件端点门禁', () => {
  async function callAdminEndpoint(options: {
    path: string
    permissions: string[]
    session?: { user: { id: string } } | null
  }) {
    vi.resetModules()
    vi.doMock('@/lib/server-context', () => ({ getServerContext: () => ({ env: {} }) }))
    vi.doMock('@/core/auth/auth', () => ({
      getAuth: async () => ({
        api: {
          // 显式传 `null` 表示未登录，不能被 `??` 兜成默认会话。
          getSession: async () =>
            'session' in options ? options.session : { user: { id: 'u_1' } },
        },
        handler: async () => Response.json({ reached: true }),
      }),
    }))
    vi.doMock('@/core/db', () => ({ createDbFromEnv: async () => ({}) }))
    vi.doMock('@/core/auth/rbac', async () => {
      const actual = await vi.importActual<typeof import('@/core/auth/rbac')>('@/core/auth/rbac')
      return { ...actual, loadUserPermissions: async () => options.permissions }
    })

    const { Route } = await import('@/routes/api/auth/$')
    const handler = (Route as { options?: { server?: { handlers?: { POST?: unknown } } } }).options
      ?.server?.handlers?.POST as (ctx: { request: Request }) => Promise<Response>
    return handler({
      request: new Request(`https://jerbix.dev${options.path}`, { method: 'POST' }),
    })
  }

  it('只读 viewer（仅 admin.users.read）不能 set-role', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/set-role',
      permissions: ['admin.users.read', 'admin.content.read'],
    })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'FORBIDDEN' })
  })

  it('未列出的端点默认按写权限收紧', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/impersonate-user',
      permissions: ['admin.users.read'],
    })
    expect(res.status).toBe(403)
  })

  it('持 admin.users.write 时放行到 better-auth', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/set-role',
      permissions: ['admin.users.write'],
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ reached: true })
  })

  it('只读端点要 admin.users.read', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/list-users',
      permissions: ['admin.users.write'],
    })
    expect(res.status).toBe(403)
  })

  it('stop-impersonating 不设权限点：被模拟的用户必须能自己退出', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/stop-impersonating',
      permissions: [],
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ reached: true })
  })

  it('未登录时 401', async () => {
    const res = await callAdminEndpoint({
      path: '/api/auth/admin/set-role',
      permissions: ['admin.users.write'],
      session: null,
    })
    expect(res.status).toBe(401)
  })
})
