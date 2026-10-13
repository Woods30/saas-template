/**
 * 主题解析的纯逻辑：不依赖框架、便于单测。
 *
 * 主题取值：
 * - `light` / `dark`：用户显式选择；
 * - `system`：跟随系统 `prefers-color-scheme`。
 *
 * 服务端通过 ALS 得到请求的 cookie 值；客户端直接读 `document.cookie`。
 * 二者对同一 cookie 得出同一结果，因此 SSR 与 hydration 一致（与 locale 同构）。
 */
import { readCookieValue } from '@/lib/locale'

export const THEME_COOKIE_NAME = 'THEME'

export const THEMES = ['light', 'dark', 'system'] as const

export type Theme = (typeof THEMES)[number]

export const defaultTheme: Theme = 'system'

/** 把任意字符串归一化为受支持的 theme；未知或缺失返回 `undefined`。 */
export function parseTheme(value: string | undefined): Theme | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return THEMES.find((theme) => theme === normalized)
}

/** 点击主题按钮时的下一个状态：light → dark → system → light。 */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'light') return 'dark'
  if (theme === 'dark') return 'system'
  return 'light'
}

/**
 * 服务端主题读取器。`src/server.ts` 在模块加载期注入（读取 ALS），
 * 使本模块保持「无服务端依赖」，可安全进入客户端 bundle。
 */
let serverThemeGetter: () => Theme = () => defaultTheme

export function setServerThemeGetter(getter: () => Theme): void {
  serverThemeGetter = getter
}

/**
 * 读取当前请求 / 会话的主题。
 * - 服务端（无 `document`）：走注入的 ALS 读取器；
 * - 客户端：读 `THEME` cookie，缺失回退 `system`。
 */
export function getTheme(): Theme {
  if (typeof document === 'undefined') return serverThemeGetter()
  return parseTheme(readCookieValue(document.cookie, THEME_COOKIE_NAME)) ?? defaultTheme
}
