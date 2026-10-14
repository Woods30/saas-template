import { z } from 'zod'

/**
 * 受支持语言的**单一事实来源**。
 *
 * 语言列表此前散落在六处：本仓库的 `src/lib/locale.ts`（`LOCALES` / `localeConfig`）、
 * `project.inlang/settings.json`、`content-collections.ts`、`src/lib/content-locale.ts`、
 * sitemap 的 `as Locale` 强转，以及 `src/{mail,payment,newsletter}/types.ts` 里各自
 * 手写的 `'zh' | 'en'`。新增一种语言要改六处，且漏改不会报错——只会静默地把新内容
 * 归到旧语言下。
 *
 * 现在所有语言相关定义都从本模块派生：解析逻辑留在 `src/lib/locale.ts`（从本模块
 * 导入），类型、schema、元数据都取自这里。
 *
 * 本模块是**纯数据 + 纯函数**：不读 env、不读框架状态，可安全进入客户端 bundle
 * （与 `src/config/website.ts` 同一约束）。
 */

/**
 * 语言元数据。
 *
 * - `code`：内部与 URL 前缀使用的短代码（`zh` / `en`）；
 * - `name`：该语言的自称，用于语言切换菜单（中文用户看到「中文」）；
 * - `englishName`：英文名，用于日志与「当前语言」的英文描述；
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
 * 受支持语言清单。新增语言只需在此追加一项，再补 `messages/{code}.json` 与
 * `project.inlang/settings.json` 的 `locales`——其余派生点会自动跟上。
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
 * 语言 cookie 名。与 `project.inlang/paraglide.config.ts` 的 `cookieName` 保持一致——
 * 客户端策略与服务端解析读写同一个 cookie，否则切换语言后重载会不一致。
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
 * 调用方决定「未知值」是回退到默认语言（cookie / `Accept-Language` 这类用户可控
 * 输入）还是拒绝（API body、内容 frontmatter）。
 */
export function parseLocale(value: string | undefined): Locale | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return LOCALES.find((locale) => locale === normalized)
}

/**
 * 边界校验用的 Zod schema。API body、内容 frontmatter 等**不该静默回退**的位置
 * 用它，让非法 locale 在入口处就被拒绝（返回 400 / 构建期报错），而不是被归到
 * 默认语言下悄悄出错。
 */
export const localeSchema = z.enum(LOCALES as unknown as [Locale, ...Locale[]])

/** HTML `lang` 属性取值，例如 `zh-CN`。 */
export function htmlLang(locale: Locale): string {
  return localeConfig[locale].hreflang
}
