import { z } from 'zod'

/**
 * 受支持语言的**单一事实来源**：类型、schema、元数据都从本模块派生，
 * 解析逻辑留在 `src/lib/locale.ts`（从本模块导入）。
 *
 * 纯数据 + 纯函数：不读 env、不读框架状态，可安全进入客户端 bundle。
 */

/**
 * 语言元数据。
 *
 * - `code`：内部与 URL 前缀使用的短代码；
 * - `name`：该语言的自称，用于语言切换菜单；
 * - `englishName`：英文名，用于日志；
 * - `hreflang`：`<html lang>` 与 SEO `hreflang` 取值（`zh-CN` 这类区域化标签）；
 * - `ogLocale`：Open Graph `og:locale` 取值（下划线分隔，如 `zh_CN`）。
 */
export interface LocaleOption {
  code: string
  name: string
  englishName: string
  hreflang: string
  ogLocale: string
}

/**
 * 新增语言只需在此追加一项，再补 `messages/{code}.json` 与
 * `project.inlang/settings.json` 的 `locales`——其余派生点自动跟上。
 */
export const LOCALE_OPTIONS = [
  { code: 'zh', name: '中文', englishName: 'Chinese', hreflang: 'zh-CN', ogLocale: 'zh_CN' },
  { code: 'en', name: 'English', englishName: 'English', hreflang: 'en', ogLocale: 'en_US' },
] as const satisfies readonly LocaleOption[]

/** 受支持的 locale 短代码。 */
export type Locale = (typeof LOCALE_OPTIONS)[number]['code']

/** 全部受支持语言，顺序与 {@link LOCALE_OPTIONS} 一致。 */
export const LOCALES: readonly Locale[] = LOCALE_OPTIONS.map((option) => option.code)

/** 默认语言：无任何偏好时的兜底。必须在 {@link LOCALES} 内（有单测锁定）。 */
export const defaultLocale: Locale = 'zh'

/**
 * 必须与 `project.inlang/paraglide.config.ts` 的 `cookieName` 一致，
 * 否则切换语言后重载会不一致。
 */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

/** `code` → 元数据。按 {@link Locale} 索引，因此不会漏键。 */
export const localeConfig = Object.fromEntries(
  LOCALE_OPTIONS.map((option) => [option.code, option]),
) as Record<Locale, LocaleOption>

/** 判断任意值是否为受支持的 locale。非字符串输入安全返回 `false`。 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * 把任意字符串归一化为受支持的 locale；未知或缺失返回 `undefined`。
 *
 * 回退还是拒绝由调用方决定：cookie / `Accept-Language` 可回退，API body 应拒绝。
 */
export function parseLocale(value: string | undefined): Locale | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return LOCALES.find((locale) => locale === normalized)
}

/**
 * 边界校验用：API body、内容 frontmatter 等**不该静默回退**的位置用它，
 * 让非法 locale 在入口处就被拒绝，而不是被归到默认语言下悄悄出错。
 */
export const localeSchema = z.enum(LOCALES as unknown as [Locale, ...Locale[]])

/** HTML `lang` 属性取值，例如 `zh-CN`。 */
export function htmlLang(locale: Locale): string {
  return localeConfig[locale].hreflang
}
