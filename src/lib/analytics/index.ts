import { websiteConfig } from '@/config/website'
import { publicEnv } from '@/env/public'
import { ClarityAnalyticsProvider } from './clarity'
import { createGtag, GAAnalyticsProvider, type GtagCommand } from './ga'
import { PlausibleAnalyticsProvider } from './plausible'
import type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName } from './types'
import { UmamiAnalyticsProvider } from './umami'

const providers: AnalyticsProvider[] = []
/**
 * `undefined` = 尚未尝试初始化；`true` = 已初始化。
 *
 * 早退路径（SSR、开发环境、模块关闭）**不**置 `true`，否则一次误调用会让本进程内
 * 后续初始化全部短路。
 */
let initialized: boolean | undefined

/**
 * 是否为生产环境。
 *
 * 刻意不读 `NODE_ENV`——那是服务端字段，客户端 bundle 里不可见。
 */
function isProduction(): boolean {
  return import.meta.env.PROD === true
}

/**
 * 初始化 analytics providers。
 *
 * 仅在**浏览器 + 生产环境 + `websiteConfig.analytics.enabled`** 三者同时成立时注册。
 * 选中但缺少必要 ID / domain 的 provider 不注册也不注入脚本。
 */
export function initAnalytics() {
  if (initialized === true) return
  if (typeof window === 'undefined' || !isProduction()) {
    // 不置 `true`：SSR 或开发环境下被调用不代表浏览器端也没有机会初始化。
    return
  }
  if (!websiteConfig.analytics.enabled) return
  initialized = true

  const selected = new Set(websiteConfig.analytics.providers)

  if (selected.has('ga') && publicEnv.VITE_GA_ID) {
    const gaId = publicEnv.VITE_GA_ID
    providers.push(new GAAnalyticsProvider(gaId))
    const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
    ;(window as unknown as { dataLayer: unknown[] }).dataLayer = dataLayer
    const gtag = createGtag(dataLayer)
    ;(window as unknown as { gtag: GtagCommand }).gtag = gtag
    gtag('js', new Date())
    // GA4 必须发 `config` 才能把 measurement ID 绑定到数据流，否则事件不进报表。
    gtag('config', gaId)
    // 脚本推迟到页面 load 之后再注入：gtag.js 约 540KB，与首屏资源争抢带宽会拖慢
    // 可交互时间（实测多耗约 400ms）。命令先入队，脚本到达后 gtag.js 会照常处理。
    injectAfterLoad(`https://www.googletagmanager.com/gtag/js?id=${gaId}`)
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

/**
 * 页面 load 之后再注入脚本。
 *
 * 分析脚本不阻塞首屏渲染，但会与首屏资源争抢带宽。推迟注入让页面先可交互，
 * 分析命令先入队、脚本到达后由 gtag.js 统一处理。
 */
function injectAfterLoad(src: string, attrs: Record<string, string> = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // load 已触发（如 SPA 内的首次初始化晚于 load）时立即注入，否则等 load 事件。
  if (document.readyState === 'complete') {
    injectScript(src, attrs)
    return
  }
  window.addEventListener('load', () => injectScript(src, attrs), { once: true })
}

export function track(event: AnalyticsEvent) {
  for (const p of providers) p.track(event)
}

export function page(path: string) {
  for (const p of providers) p.page(path)
}

/** 测试辅助：清空 provider 与初始化标记，避免模块级状态跨用例泄漏。 */
export function resetAnalyticsForTesting() {
  providers.length = 0
  initialized = undefined
}

export type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName }
