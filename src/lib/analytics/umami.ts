import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class UmamiAnalyticsProvider implements AnalyticsProvider {
  constructor(readonly _websiteId: string) {}

  track(event: AnalyticsEvent) {
    const umami = (window as unknown as { umami?: (a: string, b?: object) => void }).umami
    if (typeof window === 'undefined' || typeof umami !== 'function') return
    umami(event.name, event.params)
  }

  page(_path: string) {
    // Umami auto-tracks pageviews, no manual call needed
  }
}
