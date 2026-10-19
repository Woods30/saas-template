import { publicEnv } from '@/env/public'

/** 站点基址（已去除尾部斜杠），例如 `https://example.com`。 */
export function getBaseUrl(): string {
  return publicEnv.VITE_BASE_URL.replace(/\/+$/, '')
}

/**
 * 规范化前导斜杠：缺少时补上（`pricing` → `/pricing`，`og.png` → `/og.png`），
 * 已有则原样保留，空串归一为站点根路径 `/`。
 *
 * canonical path 与 SEO 图片相对路径共用同一规范化，避免两处各写一份。
 */
export function normalizeLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * 把站内 path 拼成绝对 canonical URL。
 *
 * - 缺少前导斜杠时补上（`pricing` → `/pricing`）；
 * - 空 path 规范化为站点根（`/`）；
 * - 基址与 path 之间不会出现双斜杠。
 */
export function getCanonicalUrl(path: string): string {
  return `${getBaseUrl()}${normalizeLeadingSlash(path)}`
}

/** 站内相对路径（含 query / hash）——「已校验」的重定向目标。 */
export type SafeInternalPath = string & { readonly __internalPath: unique symbol }

/**
 * 控制字符与反斜杠——浏览器解析 URL 前会**删除**前者、把后者当作 `/`，
 * 所以含这些字符的路径无法用字符串前缀判断是否越站。
 *
 * 用 charCode 逐位比较而非 `\x00-\x1f`：正则里的控制字符字面量在源码里不可见，
 * 后续一次误编辑就会悄悄改变语义，而这里出错等于重定向防护失效。
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
 * 用于登录后回跳等「不可信输入决定跳转目标」的场景。开放重定向是个真实风险：
 * 攻击者把受害者送到 `?redirect=https://evil.com`，登录后就落在一个与本站
 * 一模一样的外站点上，密码与验证码都能被套走。
 *
 * 只查字符串前缀是不够的，浏览器解析 URL 时会先做两件事：
 *
 * - **剥离控制字符**：`/⇥/evil.com` 里的 tab 被删除后变成 `//evil.com`，
 *   前缀检查看不出问题；
 * - **把 `\` 当作 `/`**：`/\evil.com` 同样是协议相对 URL。
 *
 * 因此先挡掉控制字符与反斜杠，再用「以固定 base 解析后 origin 是否变化」
 * 收口——这一步同时覆盖 `//host`、`https://host` 与各种编码变体。
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

/**
 * 取回跳目标，非站内路径一律回落到站点根。
 *
 * 与 `safeInternalPath` 分开：调用处拿到的是**已收敛**的目标，不需要再判一次。
 * 纵深防御仍然值得——一处漏判就变成一次钓鱼入口，而代价只是多一个函数调用。
 */
export function resolveRedirectTarget(value: unknown): SafeInternalPath {
  return safeInternalPath(value) ?? SITE_ROOT
}
