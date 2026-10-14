import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClarityAnalyticsProvider } from '@/lib/analytics/clarity'
import { GAAnalyticsProvider } from '@/lib/analytics/ga'
import { PlausibleAnalyticsProvider } from '@/lib/analytics/plausible'
import { UmamiAnalyticsProvider } from '@/lib/analytics/umami'

// ---------------------------------------------------------------------------
// Analytics providers — 需要 jsdom 环境（window.gtag / window.plausible）
// ---------------------------------------------------------------------------
describe('Analytics providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom 环境允许直接删除 window 上的全局注入属性
    for (const key of ['gtag', 'plausible', 'umami', 'clarity']) {
      Reflect.deleteProperty(window, key)
    }
  })

  // ---------------------------------------------------------------------------
  // GAAnalyticsProvider
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // PlausibleAnalyticsProvider
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // UmamiAnalyticsProvider
  // ---------------------------------------------------------------------------
  it('Umami 在 umami 缺失时不抛错', () => {
    expect(() => new UmamiAnalyticsProvider('id').track({ name: 'x' })).not.toThrow()
  })

  it('Umami track 调用 umami', () => {
    const umami = vi.fn()
    ;(window as unknown as { umami: typeof umami }).umami = umami
    new UmamiAnalyticsProvider('id').track({ name: 'signup', params: { plan: 'pro' } })
    expect(umami).toHaveBeenCalledWith('signup', { plan: 'pro' })
  })

  // ---------------------------------------------------------------------------
  // ClarityAnalyticsProvider
  // ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// initAnalytics —— 启用过滤、publicEnv 来源与 Umami 脚本 URL
// ---------------------------------------------------------------------------
describe('initAnalytics', () => {
  const injected: HTMLScriptElement[] = []

  beforeEach(() => {
    vi.resetModules()
    injected.length = 0
    // 记录注入脚本，避免真实网络请求（jsdom 默认不加载 script.src）。
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
  })

  function mockConfig(analytics: { enabled: boolean; providers: string[] }) {
    vi.doMock('@/config/website', () => ({ websiteConfig: { analytics } }))
  }

  function mockPublicEnv(env: Record<string, unknown>) {
    vi.doMock('@/env/public', () => ({ publicEnv: env }))
  }

  it('analytics 关闭时不注册也不注入脚本', async () => {
    mockConfig({ enabled: false, providers: ['ga'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
  })

  it('选中 GA 且配置 ID 时注入 gtag 脚本', async () => {
    mockConfig({ enabled: true, providers: ['ga'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected.map((s) => s.src)).toContain(
      'https://www.googletagmanager.com/gtag/js?id=G-XXX',
    )
  })

  it('未选中 GA 时即使有 VITE_GA_ID 也不注入', async () => {
    mockConfig({ enabled: true, providers: ['plausible'] })
    mockPublicEnv({ VITE_GA_ID: 'G-XXX', VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    const srcs = injected.map((s) => s.src)
    expect(srcs).not.toContain('https://www.googletagmanager.com/gtag/js?id=G-XXX')
    expect(srcs).toContain('https://plausible.io/js/script.js')
  })

  it('选中 Umami 但缺脚本 URL 时不注入', async () => {
    mockConfig({ enabled: true, providers: ['umami'] })
    mockPublicEnv({ VITE_UMAMI_WEBSITE_ID: 'site-1' })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected).toHaveLength(0)
  })

  it('选中 Umami 且脚本 URL 存在时注入该 URL', async () => {
    mockConfig({ enabled: true, providers: ['umami'] })
    mockPublicEnv({
      VITE_UMAMI_WEBSITE_ID: 'site-1',
      VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
    })
    const { initAnalytics } = await import('@/lib/analytics')
    initAnalytics()
    expect(injected.map((s) => s.src)).toContain('https://stats.jerbix.dev/script.js')
    // 不再使用示例主机作为就绪依据。
    expect(injected.map((s) => s.src)).not.toContain('https://umami.example.com/script.js')
  })
})
