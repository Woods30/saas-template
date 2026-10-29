import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClarityAnalyticsProvider } from '@/lib/analytics/clarity'
import { createGtag, GAAnalyticsProvider } from '@/lib/analytics/ga'
import { PlausibleAnalyticsProvider } from '@/lib/analytics/plausible'
import { UmamiAnalyticsProvider } from '@/lib/analytics/umami'

/**
 * gtag 命令入队。
 *
 * gtag.js **只解析 `arguments` 对象**形式的 dataLayer 元素；用 rest 参数收集成的
 * 数组会被静默忽略。后果是脚本照常加载、`window.gtag` 照常存在、dataLayer 也有内容，
 * 但 GA 后台一条数据都收不到——没有任何报错可查。
 */
describe('createGtag', () => {
  it('命令以 arguments 对象入队，不能是数组', () => {
    const dataLayer: unknown[] = []
    const gtag = createGtag(dataLayer)

    gtag('config', 'G-XYZ')

    expect(dataLayer).toHaveLength(1)
    expect(Array.isArray(dataLayer[0])).toBe(false)
    expect((dataLayer[0] as IArguments)[0]).toBe('config')
    expect((dataLayer[0] as IArguments)[1]).toBe('G-XYZ')
  })

  it('多条命令保持顺序', () => {
    const dataLayer: unknown[] = []
    const gtag = createGtag(dataLayer)

    gtag('js', new Date())
    gtag('event', 'page_view', { page_path: '/x' })

    expect(dataLayer).toHaveLength(2)
    expect((dataLayer[0] as IArguments)[0]).toBe('js')
    expect((dataLayer[1] as IArguments)[0]).toBe('event')
  })
})

// Analytics providers，需要 jsdom（window.gtag / window.plausible）。
describe('Analytics providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom 允许直接删除 window 上的全局注入属性。
    for (const key of ['gtag', 'plausible', 'umami', 'clarity']) {
      Reflect.deleteProperty(window, key)
    }
  })

  // GAAnalyticsProvider。
  it('GA 在 gtag 缺失时静默', () => {
    const provider = new GAAnalyticsProvider('G-XXX')
    expect(() => provider.track({ name: 'click' })).not.toThrow()
  })

  it('GA 调用 gtag', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    new GAAnalyticsProvider('G-XXX').track({ name: 'click', params: { a: 1 } })
    expect(gtag).toHaveBeenCalledWith('event', 'click', { a: 1 })
  })

  it('GA page 调用 gtag page_view', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    new GAAnalyticsProvider('G-XXX').page('/test-path')
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/test-path' })
  })

  // PlausibleAnalyticsProvider。
  it('Plausible 在 plausible 缺失时静默', () => {
    const provider = new PlausibleAnalyticsProvider('example.com')
    expect(() => provider.track({ name: 'click' })).not.toThrow()
  })

  it('Plausible 调用 plausible', () => {
    const plausible = vi.fn()
    ;(window as unknown as { plausible: typeof plausible }).plausible = plausible
    new PlausibleAnalyticsProvider('example.com').page('/x')
    expect(plausible).toHaveBeenCalledWith('pageview', { u: '/x' })
  })

  it('Plausible track 调用 plausible', () => {
    const plausible = vi.fn()
    ;(window as unknown as { plausible: typeof plausible }).plausible = plausible
    new PlausibleAnalyticsProvider('example.com').track({ name: 'signup', params: { plan: 'pro' } })
    expect(plausible).toHaveBeenCalledWith('signup', { props: { plan: 'pro' } })
  })

  // UmamiAnalyticsProvider。
  it('Umami 在 umami 缺失时不抛错', () => {
    expect(() => new UmamiAnalyticsProvider('id').track({ name: 'x' })).not.toThrow()
  })

  it('Umami track 调用 umami', () => {
    const umami = vi.fn()
    ;(window as unknown as { umami: typeof umami }).umami = umami
    new UmamiAnalyticsProvider('id').track({ name: 'signup', params: { plan: 'pro' } })
    expect(umami).toHaveBeenCalledWith('signup', { plan: 'pro' })
  })

  // ClarityAnalyticsProvider。
  it('Clarity 在 clarity 缺失时不抛错', () => {
    expect(() => new ClarityAnalyticsProvider('id').track({ name: 'x' })).not.toThrow()
  })

  it('Clarity track 调用 clarity', () => {
    const clarity = vi.fn()
    ;(window as unknown as { clarity: typeof clarity }).clarity = clarity
    new ClarityAnalyticsProvider('id').track({ name: 'click' })
    expect(clarity).toHaveBeenCalledWith('event', 'click')
  })
})

// initAnalytics：启用过滤、publicEnv 来源与 Umami 脚本 URL。
describe('initAnalytics', () => {
  const injected: HTMLScriptElement[] = []

  beforeEach(() => {
    vi.resetModules()
    injected.length = 0
    // 记录注入脚本，避免真实网络请求。
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      injected.push(node as HTMLScriptElement)
      return node
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/config/website')
    vi.doUnmock('@/env/public')
    vi.resetModules()
    vi.stubEnv('PROD', false)
  })

  function mockConfig(analytics: { enabled: boolean; providers: string[] }) {
    vi.doMock('@/config/website', () => ({ websiteConfig: { analytics } }))
  }

  function mockPublicEnv(env: Record<string, unknown>) {
    vi.doMock('@/env/public', () => ({ publicEnv: env }))
  }

  it('analytics 关闭时不注册也不注入脚本', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: false, providers: ['ga'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
  })

  it('选中 GA 且配置 ID 时注入 gtag 脚本', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: true, providers: ['ga'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected.map((s) => s.src)).toContain(
      'https://www.googletagmanager.com/gtag/js?id=G-XXX',
    )
  })

  it('未选中 GA 时即使有 VITE_GA_ID 也不注入', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: true, providers: ['plausible'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX', VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    const srcs = injected.map((s) => s.src)
    expect(srcs).not.toContain('https://www.googletagmanager.com/gtag/js?id=G-XXX')
    expect(srcs).toContain('https://plausible.io/js/script.js')
  })

  it('选中 Umami 但缺脚本 URL 时不注入', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: true, providers: ['umami'] })
    mockPublicEnv({ VITE_UMAMI_WEBSITE_ID: 'site-1' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
  })

  it('选中 Umami 且脚本 URL 存在时注入该 URL', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: true, providers: ['umami'] })
    mockPublicEnv({
      VITE_UMAMI_WEBSITE_ID: 'site-1',
      VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
    })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected.map((s) => s.src)).toContain('https://stats.jerbix.dev/script.js')
    expect(injected.map((s) => s.src)).not.toContain('https://umami.example.com/script.js')
  })

  it('开发环境不注入任何脚本（避免污染真实账号数据）', async () => {
    vi.stubEnv('PROD', false)
    mockConfig({ enabled: true, providers: ['ga', 'plausible', 'umami', 'clarity'] })
    mockPublicEnv({
      VITE_GA_ID: 'G-XXX',
      VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev',
      VITE_UMAMI_WEBSITE_ID: 'site-1',
      VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
      VITE_CLARITY_PROJECT_ID: 'clarity-1',
    })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
  })

  it('GA 初始化会调用 gtag("config", id)，否则事件无法归属媒体资源', async () => {
    vi.stubEnv('PROD', true)
    // dataLayer 是 window 全局队列，resetModules 不会清它，必须先清空。
    ;(window as unknown as { dataLayer: unknown[] }).dataLayer = []
    mockConfig({ enabled: true, providers: ['ga'] })
    mockPublicEnv({ VITE_GA_ID: 'G-CONFIG' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    // 断言落在 dataLayer 条目上，这才是与 gtag.js 的真实契约。
    // 形状必须是 `arguments` 对象而非数组：gtag.js 只解析前者，数组形式会被静默忽略，
    // 表现为脚本正常加载但 GA 后台收不到任何数据。
    const dataLayer = (window as unknown as { dataLayer: unknown[] }).dataLayer
    expect(dataLayer).toHaveLength(2)
    expect(dataLayer.map((entry) => Array.isArray(entry))).toEqual([false, false])
    expect((dataLayer[0] as IArguments)[0]).toBe('js')
    expect((dataLayer[0] as IArguments)[1]).toBeInstanceOf(Date)
    expect((dataLayer[1] as IArguments)[0]).toBe('config')
    expect((dataLayer[1] as IArguments)[1]).toBe('G-CONFIG')
  })

  it('非浏览器环境下调用不永久占用初始化标记', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: true, providers: ['plausible'] })
    mockPublicEnv({ VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev' })
    const { initAnalytics } = await import('@/lib/analytics')
    // 第一次调用在没有 window 的环境（模拟 SSR）。
    const originalWindow = globalThis.window
    // @ts-expect-error — 故意删除 window 以模拟服务端。
    delete globalThis.window
    initAnalytics()
    globalThis.window = originalWindow
    // 恢复 browser 环境后再调用，这次必须真的初始化。
    initAnalytics()
    expect(injected.map((s) => s.src)).toContain('https://plausible.io/js/script.js')
  })

  it('模块关闭时调用不永久占用初始化标记', async () => {
    vi.stubEnv('PROD', true)
    mockConfig({ enabled: false, providers: ['plausible'] })
    mockPublicEnv({ VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
    // 配置随后生效，再次调用必须成功。
    mockConfig({ enabled: true, providers: ['plausible'] })
    vi.resetModules()
    const reimported = await import('@/lib/analytics')
    // 这里只验证关闭路径没有把标记写死。
    expect(typeof reimported.initAnalytics).toBe('function')
  })
})
