import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class ClarityAnalyticsProvider implements AnalyticsProvider {
  constructor(readonly _projectId: string) {}

  track(event: AnalyticsEvent) {
    const clarity = (window as unknown as { clarity?: (a: string, b: string) => void }).clarity
    if (typeof window === 'undefined' || typeof clarity !== 'function') return
    clarity('event', event.name)
  }

  page(_path: string) {
    // Clarity auto-tracks pageviews
  }
}
