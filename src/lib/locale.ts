/**
 * 语言（locale）解析的纯逻辑：不依赖框架、不读写全局可变状态，便于单测。
 *
 * 解析顺序为 cookie → Accept-Language → 默认语言，任何一步出现未知或畸形取值
 * 都安全回退到下一优先级，不抛异常。
 */

export const LOCALES = ['zh', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const defaultLocale: Locale = 'zh'

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

export const localeConfig = {
  zh: { name: '中文', hreflang: 'zh-CN' },
  en: { name: 'English', hreflang: 'en' },
} as const satisfies Record<Locale, { name: string; hreflang: string }>

/** HTML `lang` 属性取值，例如 `zh-CN`。 */
export function htmlLang(locale: Locale): string {
  return localeConfig[locale].hreflang
}

/** 把任意字符串归一化为受支持的 locale；未知或缺失返回 `undefined`。 */
export function parseLocale(value: string | undefined): Locale | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return LOCALES.find((locale) => locale === normalized)
}

/**
 * 从 `Cookie` 头解析语言。未知值、残缺 cookie 或非法百分号编码都返回
 * `undefined`，交由后续策略回退。
 */
export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== LOCALE_COOKIE_NAME) continue
    const raw = part.slice(separator + 1).trim()
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      // 非法百分号编码：保留原值，parseLocale 会把它判为未知语言。
    }
    return parseLocale(decoded)
  }
  return undefined
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
 * 依据真实请求解析语言：cookie 优先，其次 `Accept-Language`，最后回退默认语言。
 * 该函数是纯函数，SSR 与 hydration 使用同一实现，保证两侧结果一致。
 */
export function resolveLocale(request: Request): Locale {
  return (
    readLocaleCookie(request.headers.get('cookie')) ??
    parseAcceptLanguage(request.headers.get('accept-language')) ??
    defaultLocale
  )
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
