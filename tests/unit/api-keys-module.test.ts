import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `features.enableApiKeys` 门禁。
 *
 * API key 管理是**功能开关**（`features.*`），不是服务模块（`mail`/`contact`/...）。
 * 它与 auth 模块门禁正交：auth 开着、但 enableApiKeys 关着时，`/api/auth/api-key/*`
 * 必须返回 404，且不得进入 better-auth handler——否则用户能绕过 UI 直接建 key。
 *
 * 门禁落在 `src/routes/api/auth/$.ts` 的 GET/POST handler 里、`getAuth()` 之前。
 */

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ apiKeys: [] })),
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

/** 用覆盖后的 websiteConfig 重新导入 auth 路由，只覆盖 features 开关。 */
async function importAuthRouteWithFeatures(features: {
  enableApiKeys: boolean
}): Promise<{ Route: unknown }> {
  vi.resetModules()
  vi.doMock('@/config/website', async () => {
    const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
    const { parsePublicEnv } = await vi.importActual<typeof import('@/env/public')>('@/env/public')
    const base = actual.createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
    return {
      ...actual,
      websiteConfig: { ...base, features: { ...base.features, ...features } },
    }
  })
  return import('@/routes/api/auth/$')
}

describe('features.enableApiKeys 门禁', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enableApiKeys 关闭时 GET /api/auth/api-key/list 返回 404，且不进入 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ enableApiKeys: false })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/api-key/list'),
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('enableApiKeys 关闭时 POST /api/auth/api-key/create 返回 404，且不进入 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ enableApiKeys: false })
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

  it('enableApiKeys 关闭不影响非 api-key 的 auth 端点', async () => {
    const { Route } = await importAuthRouteWithFeatures({ enableApiKeys: false })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/session'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })

  it('enableApiKeys 开启时 api-key 端点放行到 better-auth', async () => {
    const { Route } = await importAuthRouteWithFeatures({ enableApiKeys: true })
    const handler = getHandler(Route, 'GET')
    const res = await handler({
      request: new Request('https://jerbix.dev/api/auth/api-key/list'),
    })
    expect(res.status).toBe(200)
    expect(mocks.getAuth).toHaveBeenCalled()
  })
})
