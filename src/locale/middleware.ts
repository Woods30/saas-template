/**
 * 服务端语言解析：把 `src/lib/locale.ts` 的纯函数接到 Paraglide 的请求上下文。
 *
 * 关键点：
 * - `resolveLocale` 依据**真实请求**解析（cookie → Accept-Language → zh），SSR 与
 *   hydration 共用同一实现，因此两侧结果一致。
 * - locale 只存放在 Paraglide 生成的 AsyncLocalStorage store 中，按请求隔离；
 *   不写入任何模块级可变变量，交错请求之间不会串语言。
 * - 服务端不支持 cookie/localStorage 策略，这里注册一个自定义策略，直接复用
 *   `resolveLocale`，避免 Paraglide 内置策略与本项目解析规则出现两套逻辑。
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
 * 因此由 `src/server.ts` 在模块加载期引入。
 */
export function registerServerLocaleStrategy(): void {
  if (registered) return
  registered = true
  defineCustomServerStrategy(SERVER_LOCALE_STRATEGY, {
    getLocale: (request) => (request ? resolveRequestLocale(request) : undefined),
  })
}
