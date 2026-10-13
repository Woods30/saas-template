import { ClarityAnalyticsProvider } from './clarity'
import { GAAnalyticsProvider } from './ga'
import { PlausibleAnalyticsProvider } from './plausible'
import type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName } from './types'
import { UmamiAnalyticsProvider } from './umami'

const providers: AnalyticsProvider[] = []
let initialized = false

/**
 * 初始化 analytics providers。按实际存在的 `VITE_*` env 启用对应 provider；
 * 缺配置则不注入也不注册。`track` / `page` 在无 provider 时为空操作。
 */
export function initAnalytics() {
  if (initialized) return
  initialized = true

  const gaId = import.meta.env.VITE_GA_ID as string | undefined
  if (gaId) {
    providers.push(new GAAnalyticsProvider(gaId))
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${gaId}`)
    ;(window as unknown as { dataLayer: unknown[] }).dataLayer =
      (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
    const gtag = function gtag(...args: unknown[]) {
      ;(window as unknown as { dataLayer: unknown[] }).dataLayer.push(args)
    }
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    gtag('js', new Date())
  }

  const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined
  if (plausibleDomain) {
    providers.push(new PlausibleAnalyticsProvider(plausibleDomain))
    injectScript('https://plausible.io/js/script.js', {
      'data-domain': plausibleDomain,
    })
  }

  const umamiId = (import.meta.env.VITE_UMAMI_WEBSITE_ID ?? import.meta.env.VITE_UMAMI_ID) as
    | string
    | undefined
  if (umamiId) {
    providers.push(new UmamiAnalyticsProvider(umamiId))
    injectScript('https://umami.example.com/script.js', {
      'data-website-id': umamiId,
    })
  }

  const clarityId = (import.meta.env.VITE_CLARITY_PROJECT_ID ?? import.meta.env.VITE_CLARITY_ID) as
    | string
    | undefined
  if (clarityId) {
    providers.push(new ClarityAnalyticsProvider(clarityId))
    injectScript(`https://www.clarity.ms/tag/${clarityId}`)
  }
}

function injectScript(src: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return
  const s = document.createElement('script')
  s.src = src
  s.async = true
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
  document.head.appendChild(s)
}

export function track(event: AnalyticsEvent) {
  for (const p of providers) p.track(event)
}

export function page(path: string) {
  for (const p of providers) p.page(path)
}

export type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName }
