import { describe, expect, it, vi } from 'vitest'
import { assertAdminRole } from '@/lib/module-access'

/**
 * Admin 门禁的两层。
 *
 * 1. **功能开关**（`features.enableAdmin`）：关闭时 `/api/auth/admin/*` 整体 404，
 *    与 API key 的 flag 门禁同构。
 * 2. **角色**：`assertAdminRole` 在非 admin 时抛 `notFound()`，页面以 404 呈现——
 *    不泄漏「这个页面存在但你没权限」，与 `assertFeatureEnabled` 语义一致。
 *
 * 角色判定只认 `'admin'`，不做前缀 / 大小写模糊匹配；`undefined`（未登录或字段缺失）
 * 一律拒绝。
 */

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ users: [] })),
  getAuth: vi.fn(),
}))

vi.mock('@/auth/auth', () => ({
  getAuth: (...args: unknown[]) => {
    mocks.getAuth(...args)
    return { handler: mocks.handler }
  },
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({ env: {} }),
  als: { getStore: () => ({ env: {} }) },
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
      websiteConfig: { ...base, features: { ...base.features, enableAdmin } },
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
