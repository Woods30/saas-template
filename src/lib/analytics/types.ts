export type AnalyticsEvent = {
  name: string
  params?: Record<string, string | number | boolean>
}

export type AnalyticsProviderName = 'ga' | 'plausible' | 'umami' | 'clarity'

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): void
  page(path: string): void
}
