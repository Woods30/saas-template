import { describe, expect, it, beforeEach, vi } from 'vitest'
import { GAAnalyticsProvider } from '@/lib/analytics/ga'
import { PlausibleAnalyticsProvider } from '@/lib/analytics/plausible'
import { UmamiAnalyticsProvider } from '@/lib/analytics/umami'
import { ClarityAnalyticsProvider } from '@/lib/analytics/clarity'

// ---------------------------------------------------------------------------
// Analytics providers — 需要 jsdom 环境（window.gtag / window.plausible）
// ---------------------------------------------------------------------------
describe('Analytics providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // @ts-ignore — jsdom 环境允许直接删除 window 属性
    delete (window as Record<string, unknown>)['gtag']
    // @ts-ignore
    delete (window as Record<string, unknown>)['plausible']
    // @ts-ignore
    delete (window as Record<string, unknown>)['umami']
    // @ts-ignore
    delete (window as Record<string, unknown>)['clarity']
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
