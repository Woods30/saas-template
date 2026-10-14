import { websiteConfig } from '@/config/website'
import { publicEnv } from '@/env/public'
import { ClarityAnalyticsProvider } from './clarity'
import { GAAnalyticsProvider } from './ga'
import { PlausibleAnalyticsProvider } from './plausible'
import type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName } from './types'
import { UmamiAnalyticsProvider } from './umami'

const providers: AnalyticsProvider[] = []
let initialized = false

/**
 * 初始化 analytics providers。
 *
 * 仅在浏览器且 `websiteConfig.analytics.enabled` 为真时注册配置中选中的适配器；
 * 变量统一取自 `publicEnv`（`src/env/public.ts` 为读取公开 env 的唯一边界）。
 * 选中但缺少必要 ID / domain 的 provider 不注册也不注入脚本；Umami 额外要求
 * `VITE_UMAMI_SCRIPT_URL`，缺失时不注入。`track` / `page` 在无 provider 时为空操作。
 *
 * 本模块只负责启用过滤与脚本注入，不代表采集端点已可用（由后续子项目完成）。
 */
export function initAnalytics() {
  if (initialized) return
  initialized = true
  if (typeof window === 'undefined' || !websiteConfig.analytics.enabled) return

  const selected = new Set(websiteConfig.analytics.providers)

  if (selected.has('ga') && publicEnv.VITE_GA_ID) {
    const gaId = publicEnv.VITE_GA_ID
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

  if (selected.has('plausible') && publicEnv.VITE_PLAUSIBLE_DOMAIN) {
    const plausibleDomain = publicEnv.VITE_PLAUSIBLE_DOMAIN
    providers.push(new PlausibleAnalyticsProvider(plausibleDomain))
    injectScript('https://plausible.io/js/script.js', {
      'data-domain': plausibleDomain,
    })
  }

  const umamiId = publicEnv.VITE_UMAMI_WEBSITE_ID ?? publicEnv.VITE_UMAMI_ID
  const umamiScriptUrl = publicEnv.VITE_UMAMI_SCRIPT_URL
  if (selected.has('umami') && umamiId && umamiScriptUrl) {
    providers.push(new UmamiAnalyticsProvider(umamiId))
    injectScript(umamiScriptUrl, {
      'data-website-id': umamiId,
    })
  }

  const clarityId = publicEnv.VITE_CLARITY_PROJECT_ID ?? publicEnv.VITE_CLARITY_ID
  if (selected.has('clarity') && clarityId) {
    providers.push(new ClarityAnalyticsProvider(clarityId))
    injectScript(`https://www.clarity.ms/tag/${clarityId}`)
  }
}

function injectScript(src: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return
  const s = document.createElement('script')
  s.src = src
  s.async = true
  s.defer = true
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
