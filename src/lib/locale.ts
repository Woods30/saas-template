/**
 * 语言（locale）解析的纯逻辑：不依赖框架、不读写全局可变状态，便于单测。
 *
 * 解析顺序为 cookie → Accept-Language → 默认语言，任何一步出现未知或畸形取值
 * 都安全回退到下一优先级，不抛异常。
 *
 * 受支持语言的**清单与元数据**不在这里，而在 `src/config/locale.ts`（单一事实
 * 来源）；本模块只负责「怎么解析」。两者分开后，本文件不必随新增语言改动，
 * 而需要知道有哪些语言的地方一律从配置取。
 */

import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
  parseLocale,
} from '@/config/locale'
import { getLocale } from '@/locale/paraglide/runtime.js'

// 重新导出配置符号：既有调用方（含 40+ 条 `tests/unit/locale.test.ts` 用例）都从
// 本模块导入，保持这一入口可以避免无谓的调用点改动。真正的事实来源仍是配置模块。
export {
  defaultLocale,
  htmlLang,
  isLocale,
  LOCALE_COOKIE_NAME,
  LOCALE_OPTIONS,
  LOCALES,
  type Locale,
  type LocaleOption,
  localeConfig,
  localeSchema,
  parseLocale,
} from '@/config/locale'

/**
 * 从 `Cookie` 头中按名取出 cookie 原始值（**不做**百分号解码）。
 * 缺失、无 `=` 或未命中都返回 `undefined`；值首尾空白会被裁剪。
 *
 * 这是 cookie 解析的唯一实现：`readLocaleCookie` 与 server entry 的持久化比较
 * 都经由此函数，避免出现「一处解码、一处不解码」导致的不一致。
 */
export function readCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    return part.slice(separator + 1).trim()
  }
  return undefined
}

/**
 * 从 `Cookie` 头解析语言。未知值、残缺 cookie 或非法百分号编码都返回
 * `undefined`，交由后续策略回退。百分号解码只发生在这里。
 */
export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | undefined {
  const raw = readCookieValue(cookieHeader, LOCALE_COOKIE_NAME)
  if (raw === undefined) return undefined
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // 非法百分号编码：保留原值，parseLocale 会把它判为未知语言。
  }
  return parseLocale(decoded)
}

interface LanguageRange {
  tag: string
  quality: number
}

/**
 * 解析 `Accept-Language`，按 q 值降序返回基础语言标签。`q=0` 表示「明确拒绝」，
 * 该语言会被跳过（RFC 9110）；畸形 q 值按 0 处理。
 */
function parseLanguageRanges(header: string): LanguageRange[] {
  const ranges: LanguageRange[] = []
  for (const entry of header.split(',')) {
    const [rawTag, ...params] = entry.split(';')
    const tag = rawTag?.trim().toLowerCase()
    if (!tag) continue
    let quality = 1
    for (const param of params) {
      const [key, value] = param.split('=')
      if (key?.trim().toLowerCase() !== 'q') continue
      const parsed = Number.parseFloat(value?.trim() ?? '')
      quality = Number.isFinite(parsed) ? parsed : 0
    }
    ranges.push({ tag, quality })
  }
  return ranges.sort((a, b) => b.quality - a.quality)
}

/** 从 `Accept-Language` 选出可用语言；无匹配返回 `undefined`。 */
export function parseAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined
  for (const range of parseLanguageRanges(header)) {
    if (range.quality <= 0) continue
    const baseTag = range.tag.split('-')[0]
    const matched = parseLocale(baseTag)
    if (matched) return matched
  }
  return undefined
}

/**
 * 依据真实请求解析语言，优先级：URL 显式前缀 → cookie → `Accept-Language` → 默认语言。
 *
 * URL 前缀优先级最高，使 `/en/pricing` 这类可分享、可被爬虫抓取的显式前缀 URL 渲染对应
 * 语言内容（与 sitemap / hreflang 输出一致）。无前缀的 `/` 则回退到 cookie / 请求头。
 *
 * 该函数是纯函数，SSR 与 hydration 使用同一实现，保证两侧结果一致。
 */
export function resolveLocale(request: Request): Locale {
  return (
    localeFromPathname(new URL(request.url).pathname) ??
    readLocaleCookie(request.headers.get('cookie')) ??
    parseAcceptLanguage(request.headers.get('accept-language')) ??
    defaultLocale
  )
}

/**
 * 当前请求的语言，已校验为受支持的 {@link Locale}。
 *
 * Paraglide 的 `getLocale()` 声明为返回 `Locale`，但它的实现读 cookie / `Accept-Language`
 * 这类**用户可控**输入，实际可能给出未支持的值。此前调用方一律用 `getLocale() as Locale`
 * 强转把风险掩盖掉——类型看着对，运行期却可能拿到 `'fr'`。
 *
 * 这里做一次显式校验并回退默认语言：调用方不必再写断言，也不会把非法值传进
 * `docsForLocale` 这类按语言查找的地方（那会静默返回空列表）。
 */
export function getRequestLocale(): Locale {
  const raw: unknown = getLocale()
  return isLocale(raw) ? raw : defaultLocale
}

/**
 * 逐条记录对象比较键集合（忽略 `$schema`），返回相对于 base 缺失与多余的键。
 * 供 `scripts/check-locale.ts` 复用，保证「双向相等」的判定只有一处实现。
 */
export function compareMessageKeys(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
): { missing: string[]; extra: string[] } {
  const baseKeys = new Set(Object.keys(base).filter((key) => key !== '$schema'))
  const candidateKeys = new Set(Object.keys(candidate).filter((key) => key !== '$schema'))
  return {
    missing: [...baseKeys].filter((key) => !candidateKeys.has(key)).sort(),
    extra: [...candidateKeys].filter((key) => !baseKeys.has(key)).sort(),
  }
}

/**
 * 从 pathname 提取显式 locale 前缀（`/en/x` → `en`）；无前缀或未知前缀返回 `undefined`。
 * 仅识别完整的第一段，避免 `/english` 被误判为 `en`。
 */
export function localeFromPathname(pathname: string): Locale | undefined {
  const [, first] = pathname.split('/')
  return parseLocale(first)
}

/**
 * 剥离开头的已知 locale 前缀，返回裸路径。
 * `/en` → `/`；`/en/pricing` → `/pricing`；`/pricing` → `/pricing`；`/fr/x` → `/fr/x`。
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/')
  if (segments.length >= 2 && parseLocale(segments[1])) {
    const rest = `/${segments.slice(2).join('/')}`
    return rest === '/' ? '/' : rest.replace(/\/$/, '')
  }
  return pathname || '/'
}

/**
 * 把 pathname 的 locale 前缀替换为 `next`，用于语言切换时导航到真实 URL。
 * 未知前缀不会被剥离，只在新前缀后保留原路径（避免丢路径）。
 */
export function swapLocale(pathname: string, next: Locale): string {
  const bare = stripLocalePrefix(pathname)
  return bare === '/' ? `/${next}` : `/${next}${bare}`
}
