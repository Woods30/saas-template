/**
 * 语言（locale）解析的纯逻辑：不依赖框架、不读写全局可变状态，便于单测。
 *
 * 语言清单与元数据的事实来源在 `src/config/locale.ts`，本模块只负责「怎么解析」。
 */

import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
  parseLocale,
} from '@/config/locale'
import { getLocale } from '@/locale/paraglide/runtime.js'

// 重新导出配置符号，保持既有调用方从本模块导入的入口不变。
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
 * `undefined`，交由后续策略回退。
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
 * URL 前缀优先，使 `/en/pricing` 这类可分享 URL 渲染对应语言（与 sitemap / hreflang 一致）。
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
 * Paraglide 的 `getLocale()` 类型上返回 `Locale`，但读的是用户可控输入，运行期可能
 * 给出未支持的值；直接用会让 `docsForLocale` 这类查找静默返回空列表。
 */
export function getRequestLocale(): Locale {
  const raw: unknown = getLocale()
  return isLocale(raw) ? raw : defaultLocale
}

/** 比较两个语言文件的键集合（忽略 `$schema`），返回缺失与多余的键。 */
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

/** 剥离开头的已知 locale 前缀，返回裸路径（`/en/pricing` → `/pricing`）。 */
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
 * 未知前缀不会被剥离，只在新前缀后保留原路径。
 */
export function swapLocale(pathname: string, next: Locale): string {
  const bare = stripLocalePrefix(pathname)
  return bare === '/' ? `/${next}` : `/${next}${bare}`
}
