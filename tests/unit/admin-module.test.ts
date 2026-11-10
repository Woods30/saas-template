import { describe, expect, it, vi } from 'vitest'
import type { AdminActionDeps } from '@/collection/server'
import { assertAdminRole } from '@/lib/module-access'

/**
 * Admin 门禁的两层：功能开关关闭时整体 404；非 admin 抛 `notFound()`，不泄漏
 * 「页面存在但你没权限」。角色只认 `'admin'`，`undefined` 一律拒绝。
 */

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ users: [] })),
  getAuth: vi.fn(),
  /** collection server function 的会话：逐用例改写。 */
  session: null as { user: { id: string; role: string } } | null,
  rateLimit: vi.fn(async (_opts: unknown) => true),
}))

vi.mock('@/auth/auth', () => ({
  getAuth: (...args: unknown[]) => {
    mocks.getAuth(...args)
    return {
      handler: mocks.handler,
      api: { getSession: async () => mocks.session },
    }
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

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: async () => new Headers(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (opts: unknown) => mocks.rateLimit(opts),
}))

type Handler = (ctx: { request: Request }) => Promise<Response>

function getHandler(route: unknown, method: 'GET' | 'POST'): Handler {
  const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
    .options?.server?.handlers
  const handler = handlers?.[method]
  if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
  return handler as Handler
}

async function importAuthRouteWithAdminFlag(enableAdmin: boolean): Promise<{ Route: unknown }> {
  vi.resetModules()
  vi.doMock('@/config/website', async () => {
    const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
    const { parsePublicEnv } = await vi.importActual<typeof import('@/env/public')>('@/env/public')
    const base = actual.createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
    return {
      ...actual,
      // auth 与 mail 显式打开：它们默认随部署场景变化，而这里只关心 admin 端点的门禁
      // （auth 要求邮箱验证，邮件没配齐会被判成 incomplete 而返回 503）。
      websiteConfig: {
        ...base,
        auth: { ...base.auth, enabled: true },
        mail: { ...base.mail, enabled: true },
        features: { ...base.features, enableAdmin },
      },
    }
  })
  return import('@/routes/api/auth/$')
}

describe('features.enableAdmin 门禁', () => {
  it('关闭时 /api/auth/admin/list-users 返回 404，且不进入 better-auth', async () => {
    const { Route } = await importAuthRouteWithAdminFlag(false)
    const res = await getHandler(
      Route,
      'GET',
    )({
      request: new Request('https://jerbix.dev/api/auth/admin/list-users'),
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('关闭时不影响非 admin 的 auth 端点', async () => {
    const { Route } = await importAuthRouteWithAdminFlag(false)
    const res = await getHandler(
      Route,
      'GET',
    )({
      request: new Request('https://jerbix.dev/api/auth/session'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })

  it('开启时 admin 端点放行到 better-auth', async () => {
    const { Route } = await importAuthRouteWithAdminFlag(true)
    const res = await getHandler(
      Route,
      'GET',
    )({
      request: new Request('https://jerbix.dev/api/auth/admin/list-users'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })
})

describe('assertAdminRole', () => {
  it("role 为 'admin' 时不抛", () => {
    expect(() => assertAdminRole('admin')).not.toThrow()
  })

  it.each([['user'], ['viewer'], [''], [undefined]])('role 为 %s 时抛 notFound', (role) => {
    expect(() => assertAdminRole(role as string | undefined)).toThrow()
  })

  it('不匹配大小写或前缀变体', () => {
    expect(() => assertAdminRole('Admin')).toThrow()
    expect(() => assertAdminRole('administrator')).toThrow()
  })
})

describe('collection 管理端点越权', () => {
  /**
   * 门禁顺序与 Task 6 契约：模块门禁 → 服务端会话 → 角色。角色只认服务端
   * 会话里的 `role === 'admin'`，普通用户一律 403 `FORBIDDEN`——不只测菜单
   * 隐藏，直接调动作也要被拒。
   *
   * 驱动的是 `src/collection/server.ts` 里可注入的管理员动作实现：server
   * function 的接线由 vite 插件在构建期改写，单测里调用它不会走到 handler
   * （见 `tests/unit/collection-server.test.ts` 的说明）。
   */

  /**
   * 造一份管理员动作依赖，并记录取库的次数。
   *
   * 门禁不通过时不该碰数据库，所以取库次数本身就是断言的一部分。
   */
  function makeAdminDeps(session: { userId: string; role: string } | null) {
    let dbCalls = 0
    const deps: AdminActionDeps = {
      guard: {
        module: () => undefined,
        session: async () => session,
        rateLimit: async () => true,
        ip: '1.2.3.4',
      },
      db: async () => {
        dbCalls += 1
        throw new Error('门禁之外才该连库')
      },
    }
    return { deps, dbCalls: () => dbCalls }
  }

  it('非管理员直接调管理员订单列表返回 403 FORBIDDEN，且不碰数据库', async () => {
    const { adminListOrders } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps({ userId: 'u_1', role: 'user' })
    const result = await adminListOrders(deps, {})
    expect(result instanceof Response).toBe(true)
    const response = result as Response
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'FORBIDDEN' })
    expect(dbCalls()).toBe(0)
  })

  it('非管理员直接调管理员核验订单返回 403', async () => {
    const { adminReviewOrder } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps({ userId: 'u_1', role: 'user' })
    const result = await adminReviewOrder(deps, {
      orderId: 'ord_1',
      action: 'approve',
      observedAmount: 18001,
    })
    expect(result instanceof Response).toBe(true)
    expect((result as Response).status).toBe(403)
    expect(dbCalls()).toBe(0)
  })

  it('非管理员直接调保存收款账户返回 403', async () => {
    const { adminSaveAccount } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps({ userId: 'u_1', role: 'user' })
    const result = await adminSaveAccount(deps, { accountId: 'acct', displayName: '测试' })
    expect(result instanceof Response).toBe(true)
    expect((result as Response).status).toBe(403)
    expect(dbCalls()).toBe(0)
  })

  it('管理员角色通过门禁，进入参数校验层', async () => {
    const { adminListOrders } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps({ userId: 'a_1', role: 'admin' })
    // limit 越界：说明门禁已放行、进入参数校验层，且还没到取库那一步。
    const result = await adminListOrders(deps, { limit: 999 })
    expect(result instanceof Response).toBe(true)
    expect((result as Response).status).toBe(400)
    await expect((result as Response).json()).resolves.toEqual({ error: 'INVALID_INPUT' })
    expect(dbCalls()).toBe(0)
  })

  it('管理员通过门禁后才会取库', async () => {
    const { adminListOrders } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps({ userId: 'a_1', role: 'admin' })
    const result = await adminListOrders(deps, {})
    expect(result instanceof Response).toBe(true)
    // 取库失败按 500 内部错误处理，但绝不 403。
    expect((result as Response).status).toBe(500)
    expect(dbCalls()).toBe(1)
  })

  it('未登录返回 401', async () => {
    const { adminListOrders } = await import('@/collection/server')
    const { deps, dbCalls } = makeAdminDeps(null)
    const result = await adminListOrders(deps, {})
    expect(result instanceof Response).toBe(true)
    expect((result as Response).status).toBe(401)
    await expect((result as Response).json()).resolves.toEqual({ error: 'UNAUTHENTICATED' })
    expect(dbCalls()).toBe(0)
  })
})
