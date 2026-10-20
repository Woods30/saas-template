import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — 只在边界 mock SDK / 认证 / provider，门禁逻辑走真实实现。
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  getAuth: vi.fn(),
  subscribe: vi.fn().mockResolvedValue(true),
  unsubscribe: vi.fn().mockResolvedValue(true),
  newsletterCheckRateLimit: vi.fn().mockResolvedValue(true),
  deliverContactNotification: vi.fn().mockResolvedValue(undefined),
  getPaymentProvider: vi.fn(),
  sendMail: vi.fn().mockResolvedValue({ ok: true }),
  createDb: vi.fn(),
  getServerContext: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}))

vi.mock('@/auth/auth', () => ({
  getAuth: (...args: unknown[]) => mocks.getAuth(...args),
}))

vi.mock('@/newsletter', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.newsletterCheckRateLimit(...args),
  subscribe: (...args: unknown[]) => mocks.subscribe(...args),
  unsubscribe: (...args: unknown[]) => mocks.unsubscribe(...args),
}))

vi.mock('@/contact/notifications', () => ({
  deliverContactNotification: (...args: unknown[]) => mocks.deliverContactNotification(...args),
}))

vi.mock('@/payment', () => ({
  getPaymentProvider: (...args: unknown[]) => mocks.getPaymentProvider(...args),
}))

vi.mock('@/mail', () => ({
  sendMail: (...args: unknown[]) => mocks.sendMail(...args),
}))

vi.mock('@/db', () => ({
  createDb: (...args: unknown[]) => mocks.createDb(...args),
  // Webhook 路由会读取 `schema.webhookEvents.id` 作为幂等冲突目标。
  schema: { webhookEvents: { id: { name: 'webhook_events.id' } } },
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => mocks.getServerContext(),
  als: { getStore: () => mocks.getServerContext() },
}))

// auth 页面的 `beforeLoad` 会调用 `fetchAuthProviderAvailability`（一个 server function）。
// server function 需要 TanStack Start 的请求上下文，测试环境没有，调用会抛无关错误并
// 遮住真正要断言的门禁。这里把它替换为固定值，让门禁成为唯一被测对象。
vi.mock('@/auth/providers', () => ({
  getAuthProviderAvailability: () => ({ google: false }),
  fetchAuthProviderAvailability: async () => ({ google: false }),
}))

import { notFound } from '@tanstack/react-router'
import { createWebsiteConfig, type WebsiteConfig } from '@/config/website'
import { type PublicEnv, parsePublicEnv } from '@/env/public'
import type { ServerEnv } from '@/env/server'
import { parseServerEnv } from '@/env/server'
import { assertPageEnabled } from '@/lib/module-access'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { getSitemapPaths, renderSitemapXml } from '@/routes/sitemap[.]xml'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const publicEnv: PublicEnv = parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' })
const emptyEnv: ServerEnv = parseServerEnv({})

/** 合法的 supportEmail 字面量（避免在断言中散落同一字符串）。 */
const SUPPORT_EMAIL = ['support', 'jerbix.dev'].join('@')

/** 完整默认配置（docs/blog/changelog 开，服务关），可按键覆盖开关。 */
function makeConfig(overrides: Partial<WebsiteConfig> = {}): WebsiteConfig {
  return { ...createWebsiteConfig(publicEnv), ...overrides }
}

const creds: ServerEnv = parseServerEnv({
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'noreply@jerbix.dev',
  RESEND_AUDIENCE_ID: 'audience_1',
  STRIPE_SECRET_KEY: 'sk_test',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
})

function expectNotFound(fn: () => unknown): void {
  try {
    fn()
  } catch (error) {
    expect((error as { isNotFound?: boolean }).isNotFound).toBe(true)
    return
  }
  throw new Error('期望抛出 notFound()，但未抛出')
}

/** 同 {@link expectNotFound}，但接受 async 的 `beforeLoad`。 */
async function expectNotFoundAsync(fn: () => unknown): Promise<void> {
  try {
    await fn()
  } catch (error) {
    expect((error as { isNotFound?: boolean }).isNotFound).toBe(true)
    return
  }
  throw new Error('期望抛出 notFound()，但未抛出')
}

/**
 * 取全部 auth 页面路由的 `beforeLoad`。
 *
 * 开关通过**直接改写 `websiteConfig.auth` 单例**切换（与 `navigation.test.tsx` 同一做法）：
 * `assertPageEnabled` 在**调用时**读 `config[module].enabled`，因此无需重载模块图。
 * 路由模块在 import 时就把 `websiteConfig` 绑定进闭包，用 `doMock` 替换模块导出对已
 * 导入的路由无效——这也是此前「关闭开关后页面照旧放行」的原因。
 */
async function importAuthRoutes(): Promise<Array<() => unknown>> {
  const modules = await Promise.all([
    import('@/routes/{-$locale}/auth/login'),
    import('@/routes/{-$locale}/auth/register'),
    import('@/routes/{-$locale}/auth/forgot-password'),
    import('@/routes/{-$locale}/auth/reset-password'),
    import('@/routes/{-$locale}/auth/verify-email'),
    import('@/routes/{-$locale}/auth/error'),
  ])
  return modules.map(
    (mod) =>
      (mod.Route as { options: { beforeLoad: () => unknown } }).options.beforeLoad as () => unknown,
  )
}

// ---------------------------------------------------------------------------
// assertPageEnabled — 页面开关
// ---------------------------------------------------------------------------
describe('assertPageEnabled', () => {
  it('docs / blog / changelog 关闭时抛 notFound', () => {
    expectNotFound(() => assertPageEnabled('docs', makeConfig({ docs: { enabled: false } })))
    expectNotFound(() => assertPageEnabled('blog', makeConfig({ blog: { enabled: false } })))
    expectNotFound(() =>
      assertPageEnabled('changelog', makeConfig({ changelog: { enabled: false } })),
    )
  })

  it('服务模块关闭时抛 notFound', () => {
    expectNotFound(() => assertPageEnabled('contact', makeConfig()))
    expectNotFound(() =>
      assertPageEnabled(
        'payment',
        makeConfig({
          payment: { enabled: false, provider: 'stripe', allowedPriceIds: [], priceMap: {} },
        }),
      ),
    )
  })

  it('模块开启时不抛', () => {
    expect(() => assertPageEnabled('docs', makeConfig())).not.toThrow()
    expect(() => assertPageEnabled('blog', makeConfig())).not.toThrow()
    expect(() => assertPageEnabled('changelog', makeConfig())).not.toThrow()
  })

  it('auth 默认开启时不抛，关闭时抛 notFound', () => {
    expect(() => assertPageEnabled('auth', makeConfig())).not.toThrow()
    expectNotFound(() =>
      assertPageEnabled(
        'auth',
        makeConfig({ auth: { enabled: false, requireEmailVerification: true } }),
      ),
    )
  })

  it('抛出的错误是 notFound 标记', () => {
    // 直接确认标记来源，避免误判普通 Error。
    expect((notFound() as { isNotFound?: boolean }).isNotFound).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getModuleUnavailableResponse — API 门禁
// ---------------------------------------------------------------------------
describe('getModuleUnavailableResponse', () => {
  it('模块关闭返回 404 MODULE_DISABLED', async () => {
    const res = getModuleUnavailableResponse('newsletter', {
      config: makeConfig(),
      publicEnv,
      serverEnv: creds,
    })
    expect(res?.status).toBe(404)
    expect(await res?.json()).toEqual({ error: 'MODULE_DISABLED' })
  })

  it('已启用但配置不完整返回 503 SERVICE_UNAVAILABLE', async () => {
    const res = getModuleUnavailableResponse('newsletter', {
      config: makeConfig({ newsletter: { enabled: true, provider: 'resend' } }),
      publicEnv,
      serverEnv: emptyEnv,
    })
    expect(res?.status).toBe(503)
    expect(await res?.json()).toEqual({ error: 'SERVICE_UNAVAILABLE' })
  })

  it('contact 依赖 mail，mail 未配置完整时返回 503', () => {
    const res = getModuleUnavailableResponse('contact', {
      config: makeConfig({
        contact: { enabled: true },
        mail: { enabled: true, provider: 'resend', supportEmail: SUPPORT_EMAIL },
      }),
      publicEnv,
      serverEnv: emptyEnv,
    })
    expect(res?.status).toBe(503)
  })

  it('已启用且配置完整返回 undefined（放行）', () => {
    expect(
      getModuleUnavailableResponse('newsletter', {
        config: makeConfig({ newsletter: { enabled: true, provider: 'resend' } }),
        publicEnv,
        serverEnv: creds,
      }),
    ).toBeUndefined()
  })

  it('mail 已启用且凭据齐全返回 undefined', () => {
    expect(
      getModuleUnavailableResponse('mail', {
        config: makeConfig({
          mail: { enabled: true, provider: 'resend', supportEmail: SUPPORT_EMAIL },
        }),
        publicEnv,
        serverEnv: creds,
      }),
    ).toBeUndefined()
  })

  it('payment 已启用但缺少 allowedPriceIds 返回 503', () => {
    const res = getModuleUnavailableResponse('payment', {
      config: makeConfig({
        payment: { enabled: true, provider: 'stripe', allowedPriceIds: [], priceMap: {} },
      }),
      publicEnv,
      serverEnv: creds,
    })
    expect(res?.status).toBe(503)
  })
})

// ---------------------------------------------------------------------------
// getSitemapPaths — 纯路径工厂
// ---------------------------------------------------------------------------
describe('getSitemapPaths', () => {
  const base = 'https://jerbix.dev'

  it('默认配置含首页、features/about/roadmap/waitlist/legal 与启用的 docs/blog/changelog', () => {
    const locs = getSitemapPaths(makeConfig(), 'en').map((p) => p.loc)
    expect(locs).toContain(`${base}/en`)
    expect(locs).toContain(`${base}/en/marketing/features`)
    expect(locs).toContain(`${base}/en/marketing/about`)
    // roadmap / waitlist 没有模块开关，默认配置下必须出现在 sitemap 里。
    expect(locs).toContain(`${base}/en/marketing/roadmap`)
    expect(locs).toContain(`${base}/en/marketing/waitlist`)
    expect(locs).toContain(`${base}/en/marketing/legal/terms`)
    expect(locs).toContain(`${base}/en/marketing/legal/privacy`)
    expect(locs).toContain(`${base}/en/docs`)
    expect(locs).toContain(`${base}/en/marketing/blog`)
    expect(locs).toContain(`${base}/en/marketing/changelog`)
  })

  it('关闭模块的 pricing / contact 不进 sitemap', () => {
    // 显式关闭而不是依赖出厂默认值：`website.ts` 的模块开关随部署场景调整
    // （本仓本地联调期会打开 payment），依赖默认值的断言会随开关变更静默失效。
    const locs = getSitemapPaths(
      makeConfig({ payment: { ...makeConfig().payment, enabled: false } }),
      'en',
    ).map((p) => p.loc)
    expect(locs).not.toContain(`${base}/en/pricing`)
    expect(locs).not.toContain(`${base}/en/marketing/contact`)
  })

  it('模块开启时补上 pricing / contact', () => {
    const config = makeConfig({
      payment: {
        enabled: true,
        provider: 'stripe',
        allowedPriceIds: ['price_1'],
        priceMap: { pro_monthly: { month: 'price_1' } },
      },
      contact: { enabled: true },
    })
    const locs = getSitemapPaths(config, 'en').map((p) => p.loc)
    expect(locs).toContain(`${base}/en/pricing`)
    // 联系页已移入 marketing 布局，URL 必须带 `/marketing` 前缀——这是路由迁移的
    // 回归守卫，写错会让 sitemap 指向一个不存在的路径。
    expect(locs).toContain(`${base}/en/marketing/contact`)
  })

  it('docs 关闭时静态与动态文档路径都不出现', () => {
    const config = makeConfig({ docs: { enabled: false } })
    const source = {
      blogs: [],
      docs: [{ locale: 'en', _meta: { fileName: 'getting-started.md' } }],
    }
    const locs = getSitemapPaths(config, 'en', source).map((p) => p.loc)
    expect(locs.some((l) => l.includes('/docs'))).toBe(false)
  })

  it('blog 关闭时静态与动态博客路径都不出现', () => {
    const config = makeConfig({ blog: { enabled: false } })
    const source = {
      blogs: [
        {
          locale: 'en',
          published: true,
          _meta: { path: 'hello-world', fileName: 'hello-world.md' },
        },
      ],
      docs: [],
    }
    const locs = getSitemapPaths(config, 'en', source).map((p) => p.loc)
    expect(locs.some((l) => l.includes('/marketing/blog'))).toBe(false)
  })

  it('changelog 关闭时 changelog 路径不出现', () => {
    const config = makeConfig({ changelog: { enabled: false } })
    const locs = getSitemapPaths(config, 'en').map((p) => p.loc)
    expect(locs.some((l) => l.includes('/marketing/changelog'))).toBe(false)
  })

  it('动态博客使用真实 /marketing/blog/{path} 前缀', () => {
    const source = {
      blogs: [
        {
          locale: 'en',
          published: true,
          _meta: { path: 'hello-world', fileName: 'hello-world.md' },
        },
      ],
      docs: [],
    }
    const locs = getSitemapPaths(makeConfig(), 'en', source).map((p) => p.loc)
    expect(locs).toContain(`${base}/en/marketing/blog/hello-world`)
    expect(locs).not.toContain(`${base}/en/blog/hello-world`)
  })

  it('未发布博客被排除', () => {
    const source = {
      blogs: [{ locale: 'en', published: false, _meta: { path: 'draft', fileName: 'draft.md' } }],
      docs: [],
    }
    const locs = getSitemapPaths(makeConfig(), 'en', source).map((p) => p.loc)
    expect(locs).not.toContain(`${base}/en/marketing/blog/draft`)
  })

  it('博客 alternates 使用各语言真实的 _meta.path', () => {
    const source = {
      blogs: [
        {
          locale: 'en',
          published: true,
          _meta: { path: 'hello-world', fileName: 'hello-world.md' },
        },
        {
          locale: 'zh',
          published: true,
          _meta: { path: 'hello-world.zh', fileName: 'hello-world.zh.md' },
        },
      ],
      docs: [],
    }
    const en = getSitemapPaths(makeConfig(), 'en', source).find((p) =>
      p.loc.endsWith('/marketing/blog/hello-world'),
    )
    expect(en?.alternates).toEqual([
      { hreflang: 'zh', href: `${base}/zh/marketing/blog/hello-world.zh` },
    ])

    const zh = getSitemapPaths(makeConfig(), 'zh', source).find((p) =>
      p.loc.endsWith('/marketing/blog/hello-world.zh'),
    )
    expect(zh?.alternates).toEqual([
      { hreflang: 'en', href: `${base}/en/marketing/blog/hello-world` },
    ])
  })

  it('缺失翻译时不伪造 alternate', () => {
    const source = {
      blogs: [{ locale: 'en', published: true, _meta: { path: 'solo', fileName: 'solo.md' } }],
      docs: [{ locale: 'en', _meta: { fileName: 'only-en.md' } }],
    }
    const en = getSitemapPaths(makeConfig(), 'en', source)
    const blog = en.find((p) => p.loc.endsWith('/marketing/blog/solo'))
    expect(blog?.alternates).toEqual([])
    const doc = en.find((p) => p.loc.endsWith('/docs/only-en'))
    expect(doc?.alternates).toEqual([])
  })

  it('同 slug 双语存在时文档 alternates 指向对方语言', () => {
    const source = {
      blogs: [],
      docs: [
        { locale: 'en', _meta: { fileName: 'getting-started.md' } },
        { locale: 'zh', _meta: { fileName: 'getting-started.zh.md' } },
      ],
    }
    const en = getSitemapPaths(makeConfig(), 'en', source).find((p) =>
      p.loc.endsWith('/docs/getting-started'),
    )
    expect(en?.loc).toBe(`${base}/en/docs/getting-started`)
    expect(en?.alternates).toEqual([{ hreflang: 'zh', href: `${base}/zh/docs/getting-started` }])
  })

  it('静态页 alternates 覆盖所有存在该页的语言（不含自身）', () => {
    const en = getSitemapPaths(makeConfig(), 'en').find((p) => p.loc === `${base}/en`)
    expect(en?.alternates).toEqual([{ hreflang: 'zh', href: `${base}/zh` }])
  })

  it('用 config.baseUrl 拼装绝对 URL', () => {
    const config = makeConfig({ baseUrl: 'https://example.org' })
    const locs = getSitemapPaths(config, 'zh').map((p) => p.loc)
    expect(locs.every((l) => l.startsWith('https://example.org/'))).toBe(true)
  })

  it('路由 GET handler 序列化真实配置的 XML（关闭模块不含 pricing）', async () => {
    // 显式关闭 payment 后重新导入：本仓默认打开 payment，直接断言「不含 pricing」
    // 会把部署开关当成被测行为。
    const { Route } = (await importRouteWithConfig(
      { payment: { ...makeConfig().payment, enabled: false } },
      {},
      '@/routes/sitemap[.]xml',
    )) as { Route: unknown }
    const handlers = (
      Route as unknown as {
        options?: { server?: { handlers?: Record<string, unknown> } }
      }
    ).options?.server?.handlers
    const get = handlers?.GET
    if (typeof get !== 'function') throw new Error('GET handler 缺失')
    const response = await (get as () => Response)()
    expect(response.headers.get('Content-Type')).toContain('xml')
    const xml = await response.text()
    expect(xml).toContain('<urlset')
    expect(xml).not.toContain('/pricing</loc>')
  })
})

// ---------------------------------------------------------------------------
// renderSitemapXml — XML 转义
// ---------------------------------------------------------------------------
describe('renderSitemapXml', () => {
  it('转义 loc / href 中的 & < > 引号', () => {
    const xml = renderSitemapXml([
      {
        loc: 'https://jerbix.dev/en/a&b<c>"d\'',
        alternates: [{ hreflang: 'zh', href: 'https://jerbix.dev/zh/x&y' }],
      },
    ])
    expect(xml).toContain('https://jerbix.dev/en/a&amp;b&lt;c&gt;&quot;d&apos;')
    expect(xml).toContain('https://jerbix.dev/zh/x&amp;y')
    expect(xml).not.toContain('<c>')
  })

  it('输出合法的 urlset 骨架', () => {
    const xml = renderSitemapXml([{ loc: 'https://jerbix.dev/en', alternates: [] }])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset')
    expect(xml).toContain('<loc>https://jerbix.dev/en</loc>')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 页面路由接线 — beforeLoad 最前处门禁
// ---------------------------------------------------------------------------
describe('页面路由门禁接线', () => {
  beforeEach(() => {
    // 前面的用例可能用 `vi.doMock('@/config/website')` 覆盖过配置；模块级替身会
    // 跨用例残留，导致这里改真实 `websiteConfig` 的开关对已替换的模块不生效。
    vi.doUnmock('@/config/website')
    vi.resetModules()
  })

  it('pricing 与 contact 关闭时 beforeLoad 抛 notFound', async () => {
    // 显式关闭：本仓为本地联调把 payment 默认打开，门禁本身仍需被验证。
    const { Route: pricing } = (await importRouteWithConfig(
      { payment: { ...makeConfig().payment, enabled: false } },
      {},
      '@/routes/{-$locale}/pricing',
    )) as { Route: { options: { beforeLoad: () => unknown } } }
    const { Route: contact } = (await importRouteWithConfig(
      { contact: { enabled: false } },
      {},
      '@/routes/{-$locale}/_layout/marketing/contact',
    )) as { Route: { options: { beforeLoad: () => unknown } } }
    const pricingBeforeLoad = pricing.options.beforeLoad
    const contactBeforeLoad = contact.options.beforeLoad
    expectNotFound(() => pricingBeforeLoad())
    expectNotFound(() => contactBeforeLoad())
  })

  it('docs 父路由默认开启时 beforeLoad 不抛', async () => {
    const { Route: docs } = await import('@/routes/{-$locale}/_layout/docs')
    const beforeLoad = docs.options.beforeLoad as () => unknown
    expect(() => beforeLoad()).not.toThrow()
  })

  it('auth 页面默认开启时 beforeLoad 不抛 notFound', async () => {
    const modules = await importAuthRoutes()
    for (const beforeLoad of modules) {
      // `beforeLoad` 可能是同步（`() => assertPageEnabled(...)`）也可能是异步
      // （login / register 额外取社交登录可见性），统一 await 后断言不抛。
      await expect(Promise.resolve().then(beforeLoad)).resolves.not.toThrow()
    }
  })

  it('auth 关闭时每个 auth 页面 beforeLoad 都抛 notFound', async () => {
    // 用 `importRouteWithConfig` 而不是改已导入的 `websiteConfig`：`vi.resetModules()`
    // 之后路由持有的是新的模块实例，改旧实例上的字段不会生效。
    for (const path of [
      '@/routes/{-$locale}/auth/login',
      '@/routes/{-$locale}/auth/register',
      '@/routes/{-$locale}/auth/forgot-password',
      '@/routes/{-$locale}/auth/reset-password',
      '@/routes/{-$locale}/auth/verify-email',
      '@/routes/{-$locale}/auth/error',
    ]) {
      const { Route } = (await importRouteWithConfig(
        { auth: { ...makeConfig().auth, enabled: false } },
        {},
        path,
      )) as { Route: { options: { beforeLoad: () => unknown } } }
      await expectNotFoundAsync(Route.options.beforeLoad)
    }
  })
})

// ---------------------------------------------------------------------------
// API handler 门禁 — disabled 时在 body / auth / rate-limit / provider 之前返回
// ---------------------------------------------------------------------------
type Handler = (ctx: { request: Request }) => Promise<Response>

/** 从真实路由对象上取 server handler 并做一次边界窄化。 */
function getHandler(route: unknown, method: 'POST' | 'DELETE'): Handler {
  const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
    .options?.server?.handlers
  const handler = handlers?.[method]
  if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
  return handler as Handler
}

/**
 * 用覆盖后的 websiteConfig / server env 重新导入路由，验证 enabled 分支（503 / 放行）。
 * 只在边界 mock，门禁与 handler 主体走真实实现。
 */
async function importRouteWithConfig(
  overrides: Partial<WebsiteConfig>,
  env: Record<string, unknown>,
  path: string,
): Promise<unknown> {
  vi.resetModules()
  vi.doMock('@/config/website', async () => {
    const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
    const { parsePublicEnv } = await vi.importActual<typeof import('@/env/public')>('@/env/public')
    const base = actual.createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
    return { ...actual, websiteConfig: { ...base, ...overrides } }
  })
  vi.doMock('@/lib/server-context', () => ({
    getServerContext: () => ({ env }),
    als: { getStore: () => ({ env }) },
  }))
  return import(/* @vite-ignore */ path)
}

describe('API handler 门禁（默认服务全关）', () => {
  it('newsletter POST 返回 404，且不读取 body / 不调用 provider', async () => {
    const { Route } = await import('@/routes/api/newsletter/$')
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/newsletter/subscribe', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(read).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.newsletterCheckRateLimit).not.toHaveBeenCalled()
  })

  it('newsletter DELETE 返回 404，且不读取 body', async () => {
    const { Route } = await import('@/routes/api/newsletter/$')
    const handler = getHandler(Route, 'DELETE')
    const request = new Request('https://jerbix.dev/api/newsletter/unsubscribe', {
      method: 'DELETE',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
  })

  it('contact POST 返回 404，且不读取 body / 不调用通知 / 不调用 rate-limit', async () => {
    const { Route } = (await importRouteWithConfig(
      { contact: { enabled: false } },
      {},
      '@/routes/api/contact/$',
    )) as { Route: unknown }
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/contact/submit', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.deliverContactNotification).not.toHaveBeenCalled()
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
  })

  it('payment POST 返回 404，且不调用 auth / rate-limit / provider', async () => {
    // 本仓默认打开 payment；门禁分支用显式关闭的配置验证。
    const { Route } = (await importRouteWithConfig(
      { payment: { ...makeConfig().payment, enabled: false } },
      {},
      '@/routes/api/payment/$',
    )) as { Route: unknown }
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/payment/checkout', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.getAuth).not.toHaveBeenCalled()
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
    expect(mocks.getPaymentProvider).not.toHaveBeenCalled()
  })

  it('payment DELETE 返回 404，且不调用 auth / DB', async () => {
    const { Route } = (await importRouteWithConfig(
      { payment: { ...makeConfig().payment, enabled: false } },
      {},
      '@/routes/api/payment/$',
    )) as { Route: unknown }
    const handler = getHandler(Route, 'DELETE')
    const request = new Request('https://jerbix.dev/api/payment/portal', {
      method: 'DELETE',
      body: '{}',
    })
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(mocks.getAuth).not.toHaveBeenCalled()
    expect(mocks.createDb).not.toHaveBeenCalled()
  })

  it('email POST 返回 404，且不调用 auth / 不读取 body', async () => {
    const { Route } = await import('@/routes/api/email/$')
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/email/send', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.getAuth).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
  })

  it('auth 关闭时 /api/auth/* 返回 404，且不调用 getAuth', async () => {
    const mod = (await importRouteWithConfig(
      { auth: { enabled: false, requireEmailVerification: true } },
      {},
      '@/routes/api/auth/$',
    )) as { Route: unknown }
    const handler = getHandler(mod.Route, 'POST')
    const request = new Request('https://jerbix.dev/api/auth/sign-in/email', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await handler({ request })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(read).not.toHaveBeenCalled()
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })
})

describe('API handler 门禁（enabled 分支）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.newsletterCheckRateLimit.mockResolvedValue(true)
    mocks.subscribe.mockResolvedValue(true)
  })

  it('newsletter 启用但缺少凭据返回 503，且不读取 body', async () => {
    const mod = (await importRouteWithConfig(
      { newsletter: { enabled: true, provider: 'resend' } },
      {},
      '@/routes/api/newsletter/$',
    )) as { Route: unknown }
    const request = new Request('https://jerbix.dev/api/newsletter/subscribe', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')
    const res = await getHandler(mod.Route, 'POST')({ request })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'SERVICE_UNAVAILABLE' })
    expect(read).not.toHaveBeenCalled()
  })

  it('newsletter 启用且凭据齐全时放行，进入 rate-limit 与 provider', async () => {
    const mod = (await importRouteWithConfig(
      { newsletter: { enabled: true, provider: 'resend' } },
      { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: 'aud_1' },
      '@/routes/api/newsletter/$',
    )) as { Route: unknown }
    const request = new Request('https://jerbix.dev/api/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
    })
    const res = await getHandler(mod.Route, 'POST')({ request })
    expect(res.status).toBe(200)
    expect(mocks.newsletterCheckRateLimit).toHaveBeenCalled()
    expect(mocks.subscribe).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Stripe Webhook — 不受 payment.enabled 开关影响
// ---------------------------------------------------------------------------
describe('Stripe Webhook 不受 payment.enabled 门禁影响', () => {
  const parseWebhookEvent = vi.fn()

  function setupProvider() {
    mocks.getPaymentProvider.mockReturnValue({ parseWebhookEvent })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // 前一组用例通过 doMock 覆盖了 server-context；这里复位为共享 mock。
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => mocks.getServerContext(),
      als: { getStore: () => mocks.getServerContext() },
    }))
  })

  it('无凭据返回 503（不解析事件）', async () => {
    mocks.getServerContext.mockReturnValue({ env: {} })
    setupProvider()
    const { Route } = await import('@/routes/api/webhooks/stripe')
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'sig' },
    })
    const res = await handler({ request })
    expect(res.status).toBe(503)
    expect(parseWebhookEvent).not.toHaveBeenCalled()
  })

  it('凭据齐全但签名无效返回 400', async () => {
    mocks.getServerContext.mockReturnValue({
      env: { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh' },
    })
    parseWebhookEvent.mockRejectedValueOnce(new Error('bad signature'))
    setupProvider()
    const { Route } = await import('@/routes/api/webhooks/stripe')
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'sig' },
    })
    const res = await handler({ request })
    expect(res.status).toBe(400)
    expect(parseWebhookEvent).toHaveBeenCalled()
  })

  it('payment.enabled=false 且凭据齐全时仍调用 parseWebhookEvent', async () => {
    mocks.getServerContext.mockReturnValue({
      env: { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh' },
    })
    parseWebhookEvent.mockResolvedValueOnce({
      id: 'evt_disabled_ok',
      type: 'unknown.event',
      data: { object: {} },
    })
    setupProvider()
    // 幂等插入：模拟首次插入返回一行。
    const returning = vi.fn().mockResolvedValue([{ id: 'evt_disabled_ok' }])
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    const updateWhere = vi.fn().mockResolvedValue([])
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set: updateSet })
    mocks.createDb.mockReturnValue({ insert, update, select: vi.fn(), delete: vi.fn() })

    const { Route } = await import('@/routes/api/webhooks/stripe')
    const handler = getHandler(Route, 'POST')
    const request = new Request('https://jerbix.dev/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'sig' },
    })
    const res = await handler({ request })
    expect(res.status).toBe(200)
    expect(parseWebhookEvent).toHaveBeenCalled()
  })
})
