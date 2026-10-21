import { publicEnv } from '@/env/public'

/** 站点基址（已去除尾部斜杠），例如 `https://example.com`。 */
export function getBaseUrl(): string {
  return publicEnv.VITE_BASE_URL.replace(/\/+$/, '')
}

/** 规范化前导斜杠：`pricing` → `/pricing`，已有则原样保留。 */
export function normalizeLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

/** 把站内 path 拼成绝对 canonical URL（基址已去尾斜杠，不会出现双斜杠）。 */
export function getCanonicalUrl(path: string): string {
  return `${getBaseUrl()}${normalizeLeadingSlash(path)}`
}

/** 站内相对路径（含 query / hash）——「已校验」的重定向目标。 */
export type SafeInternalPath = string & { readonly __internalPath: unique symbol }

/**
 * 控制字符与反斜杠——浏览器解析 URL 前会**删除**前者、把后者当作 `/`，
 * 所以含这些字符的路径无法用字符串前缀判断是否越站。
 *
 * 用 charCode 逐位比较而非正则字面量：后者在源码里不可见，误编辑会让防护静默失效。
 */
function containsUnsafePathChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    // C0 控制字符（0x00-0x1F）、DEL（0x7F）、反斜杠
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true
  }
  return false
}

/**
 * 校验一个 URL 是否为**站内相对路径**，是则原样返回，否则返回 `undefined`。
 *
 * 用于登录后回跳等「不可信输入决定跳转目标」的场景：开放重定向可被用来钓鱼。
 *
 * 只查字符串前缀不够——浏览器会剥离控制字符（`/\t/evil.com` → `//evil.com`）、
 * 把 `\` 当作 `/`。故先挡掉这些字符，再用「以固定 base 解析后 origin 是否变化」收口。
 */
export function safeInternalPath(value: unknown): SafeInternalPath | undefined {
  if (typeof value !== 'string') return undefined
  if (containsUnsafePathChar(value)) return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  try {
    const base = 'https://redirect-guard.invalid'
    return new URL(value, base).origin === base ? (value as SafeInternalPath) : undefined
  } catch {
    return undefined
  }
}

/** 站点根：唯一「无需校验也确定安全」的重定向目标。 */
const SITE_ROOT = '/' as SafeInternalPath

/** 取回跳目标，非站内路径一律回落到站点根（调用处无需再判）。 */
export function resolveRedirectTarget(value: unknown): SafeInternalPath {
  return safeInternalPath(value) ?? SITE_ROOT
}
