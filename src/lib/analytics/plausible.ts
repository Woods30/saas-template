import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class PlausibleAnalyticsProvider implements AnalyticsProvider {
  constructor(readonly _domain: string) {}

  track(event: AnalyticsEvent) {
    const plausible = (window as unknown as { plausible?: (a: string, b?: object) => void })
      .plausible
    if (typeof window === 'undefined' || typeof plausible !== 'function') return
    plausible(event.name, { props: event.params })
  }

  page(path: string) {
    const plausible = (window as unknown as { plausible?: (a: string, b?: object) => void })
      .plausible
    if (typeof window === 'undefined' || typeof plausible !== 'function') return
    plausible('pageview', { u: path })
  }
}
