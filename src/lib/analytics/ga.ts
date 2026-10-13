import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class GAAnalyticsProvider implements AnalyticsProvider {
  constructor(readonly _measurementId: string) {}

  track(event: AnalyticsEvent) {
    const gtag = (window as unknown as { gtag?: (a: string, b: string, c?: object) => void }).gtag
    if (typeof window === 'undefined' || typeof gtag !== 'function') return
    gtag('event', event.name, event.params)
  }

  page(path: string) {
    const gtag = (window as unknown as { gtag?: (a: string, b: string, c?: object) => void }).gtag
    if (typeof window === 'undefined' || typeof gtag !== 'function') return
    gtag('event', 'page_view', { page_path: path })
  }
}
