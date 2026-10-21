/**
 * 服务端语言解析：把 `src/lib/locale.ts` 的纯函数接到 Paraglide 的请求上下文。
 *
 * `resolveLocale` 依据真实请求解析（URL 前缀 → cookie → Accept-Language → 默认语言），
 * SSR 与 hydration 共用同一实现。locale 只存在 Paraglide 的 ALS store 中、按请求隔离，
 * 不要改成模块级可变变量，否则交错请求会串语言。
 */

import { resolveLocale } from '../lib/locale'
import { defineCustomServerStrategy } from '../locale/paraglide/runtime.js'

/** 供服务端注册的自定义策略名；与 `project.inlang/paraglide.config.ts` 保持一致。 */
export const SERVER_LOCALE_STRATEGY = 'custom-server-locale'

/** 依据真实请求解析语言；等价于 `resolveLocale(request)`，作为自定义策略入口。 */
export function resolveRequestLocale(request: Request): string {
  return resolveLocale(request)
}

let registered = false

/**
 * 注册服务端语言策略（幂等）。必须在 `paraglideMiddleware` 首次解析语言前调用，
 * 因此 `src/server.ts` 在模块加载期引入。
 */
export function registerServerLocaleStrategy(): void {
  if (registered) return
  registered = true
  defineCustomServerStrategy(SERVER_LOCALE_STRATEGY, {
    getLocale: (request) => (request ? resolveRequestLocale(request) : undefined),
  })
}
