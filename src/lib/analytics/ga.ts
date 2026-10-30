import type { AnalyticsEvent, AnalyticsProvider } from './types'

/** gtag 命令函数：接受任意参数，入队给 gtag.js 处理。 */
export type GtagCommand = (...args: unknown[]) => void

/**
 * 创建把 gtag 命令写入 `dataLayer` 的函数。
 *
 * **必须入队 `arguments` 对象，而不是 rest 参数收集成的数组。** gtag.js 只解析
 * `arguments` 形式（官方标准写法 `function gtag(){dataLayer.push(arguments)}`）；
 * 数组形式会被**静默忽略**——脚本照常加载、`window.gtag` 照常存在、dataLayer 也有内容，
 * 但 GA 后台一条数据都收不到，且没有任何报错可查。
 */
export function createGtag(dataLayer: unknown[]): GtagCommand {
  return function gtag(...args: unknown[]) {
    // `args` 仅为满足类型签名；真正入队的是 `arguments` 对象。
    void args
    // biome-ignore lint/complexity/noArguments: gtag.js 只解析 `arguments` 对象，改用 rest 数组会被静默忽略
    dataLayer.push(arguments)
  }
}

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
