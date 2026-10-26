import { LOCALES, type Locale } from '@/config/locale'

/**
 * 无语言后缀的内容文件所属语言。
 *
 * **与 Paraglide 的 `baseLocale`（`zh`）不是同一个概念**：那个是文案兜底语言，
 * 这个是内容源语言（`content/` 约定英文为原文、`.zh.md` 为译本）。
 */
export const BASE_LOCALE: Locale = 'en'

/**
 * Resolve the content locale from a Content Collections document's `_meta.fileName`.
 *
 * Must be `_meta.fileName` (extension included): `_meta.path` has `.md` stripped,
 * so a `.zh.md` suffix check can never match and every file silently becomes `en`.
 *
 * @param fileName - `_meta.fileName` from a Content Collections document
 * @param locales - Recognised locale suffixes; defaults to the configured ones
 * @returns The document's locale, or {@link BASE_LOCALE} when unrecognised
 */
export function resolveContentLocale(
  fileName: string,
  locales: readonly string[] = LOCALES,
): Locale {
  // 要求以 `.md` 结尾，挡住误传 `_meta.path` 的调用。
  if (!fileName.endsWith('.md')) return BASE_LOCALE
  const withoutExtension = fileName.slice(0, -'.md'.length)
  const dot = withoutExtension.lastIndexOf('.')
  if (dot !== -1) {
    const suffix = withoutExtension.slice(dot + 1)
    if (locales.includes(suffix)) return suffix as Locale
  }
  return BASE_LOCALE
}

/**
 * Derive a locale-independent URL slug from a Content Collections filename.
 *
 * The slug must be stable across locales, otherwise switching language 404s:
 *
 *   index.zh.md → index    hello-world.md → hello-world
 *
 * Only suffixes present in `locales` are stripped, so a genuine dotted name
 * (`guide.v2.md`) keeps its suffix.
 *
 * @param fileName - `_meta.fileName` from a Content Collections document
 * @param locales - Recognised locale suffixes; defaults to the configured ones
 * @returns The locale-independent slug used in URLs and lookups
 */
export function contentSlug(fileName: string, locales: readonly string[] = LOCALES): string {
  const withoutExtension = fileName.replace(/\.md$/, '')
  const dot = withoutExtension.lastIndexOf('.')
  if (dot === -1) return withoutExtension
  const suffix = withoutExtension.slice(dot + 1)
  return locales.includes(suffix) ? withoutExtension.slice(0, dot) : withoutExtension
}
