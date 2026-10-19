import { websiteConfig } from '@/config/website'
import { publicEnv } from '@/env/public'
import { ClarityAnalyticsProvider } from './clarity'
import { GAAnalyticsProvider } from './ga'
import { PlausibleAnalyticsProvider } from './plausible'
import type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName } from './types'
import { UmamiAnalyticsProvider } from './umami'

const providers: AnalyticsProvider[] = []
/**
 * `undefined` = 尚未尝试初始化；`true` = 已初始化；`false` = 曾在非浏览器或
 * 模块关闭状态下被调用过，允许下次重试。
 *
 * 旧实现对任何首次调用都直接置 `true`：若 `initAnalytics()` 恰好在
 * `typeof window === 'undefined'`（SSR 流式渲染、worker 预取）或
 * `analytics.enabled === false`（配置晚于首次调用生效）时执行过一次，同一进程内
 * 后续调用全部短路，分析永远不会初始化。
 */
let initialized: boolean | undefined

/**
 * 是否为生产环境。
 *
 * `import.meta.env.PROD` 由 Vite 在构建期替换：开发服务器下为 `false`，
 * `vite build` 产物中为 `true`。这里刻意不读 `NODE_ENV`——那是服务端字段，客户端
 * bundle 里不可见。
 *
 * 分析脚本只应在生产环境加载：开发期上报会污染真实账号的数据，也会让本地网络
 * 面板里塞满第三方请求，掩盖真正要排查的内容。
 */
function isProduction(): boolean {
  return import.meta.env.PROD === true
}

/**
 * 初始化 analytics providers。
 *
 * 仅在**浏览器 + 生产环境 + `websiteConfig.analytics.enabled`** 三者同时成立时注册
 * 配置中选中的适配器；变量统一取自 `publicEnv`（`src/env/public.ts` 为读取公开 env 的
 * 唯一边界）。选中但缺少必要 ID / domain 的 provider 不注册也不注入脚本；Umami 额外
 * 要求 `VITE_UMAMI_SCRIPT_URL`，缺失时不注入。`track` / `page` 在无 provider 时为空操作。
 *
 * 生产门控是可选的：本地验证注入链路时把 `websiteConfig.analytics.enabled` 打开、
 * 以 `vite build && vite preview` 跑即可。
 */
export function initAnalytics() {
  if (initialized === true) return
  if (typeof window === 'undefined' || !isProduction()) {
    // 不置 `true`：SSR 或开发环境下被调用不代表浏览器端也没有机会初始化。
    return
  }
  if (!websiteConfig.analytics.enabled) return
  // 到这里才会真正注册，置位放在所有早退条件之后。
  initialized = true

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
    // GA4 需要 `config` 才会把 measurement ID 与实际媒体资源绑定。漏掉这一步时
    // 脚本虽然加载了，后续 `gtag('event', …)` 无法归属到正确的数据流，报表里
    // 看不到任何事件——只发 `js` 是 Universal Analytics 时代的写法。
    gtag('config', gaId)
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

/**
 * 测试辅助：清空已注册的 provider 与初始化标记。
 *
 * `initAnalytics` 的幂等标记是模块级状态，跨用例共享会导致后一个用例看不到
 * 重新初始化的效果。仅在测试中使用。
 */
export function resetAnalyticsForTesting() {
  providers.length = 0
  initialized = undefined
}

export type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName }
