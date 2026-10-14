import { LOCALES, type Locale } from '@/config/locale'

/**
 * 无语言后缀的内容文件所属语言。
 *
 * **与 Paraglide 的 `baseLocale`（`zh`）不是同一个概念**：那个是「文案兜底语言」，
 * 这个是「内容源语言」。本仓库的 `content/` 约定英文为原文、`.zh.md` 为中文译本，
 * 因此无后缀文件归为 `en`。
 */
export const BASE_LOCALE: Locale = 'en'

/**
 * Resolve the content locale from a Content Collections document's `_meta`.
 *
 * Content Collections v0.15+ exposes two filename-derived fields:
 * - `_meta.fileName` — original filename including extension
 *   (e.g. `hello-world.zh.md`)
 * - `_meta.path` — path with the extension stripped
 *   (e.g. `hello-world.zh`)
 *
 * The previous transform used `path.endsWith('.zh.md')` which could never
 * match (the `.md` was already stripped) and silently marked every Chinese
 * file as `locale: 'en'`. The blog / changelog pages then filtered on
 * `locale === getLocale()` and showed empty Chinese pages.
 *
 * Use `_meta.fileName` so the suffix `.zh.md` is present. A file with no
 * locale suffix is the **base locale** source (`en` today, matching the repo
 * convention of English originals with `.zh.md` translations); a file with a
 * recognised `.<locale>.` infix resolves to that locale.
 *
 * The locale list is a **parameter** (defaulting to the site's configured
 * languages) rather than a hardcoded `zh` / `en` pair, so adding a language
 * only requires updating `src/config/locale.ts` — this function and
 * {@link contentSlug} both follow automatically. Exported for unit testing.
 *
 * @param fileName - `_meta.fileName` from a Content Collections document
 * @param locales - Recognised locale suffixes; defaults to the configured ones
 * @returns The document's locale, or {@link BASE_LOCALE} when unrecognised
 */
export function resolveContentLocale(
  fileName: string,
  locales: readonly string[] = LOCALES,
): Locale {
  // 契约是 `_meta.fileName`（含扩展名）。要求以 `.md` 结尾能挡住「误传 `_meta.path`」
  // 这类调用错误——`_meta.path` 已剥掉 `.md`，`hello-world.zh` 会被误判成中文。
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
 * `_meta.path` strips only the final `.md`, so `index.zh.md` becomes
 * `index.zh` — a slug that is tied to one locale. Routing on that slug breaks
 * locale switching: a visitor on `/docs/index.zh` who switches to English
 * looks up a doc whose slug is `index.zh` **and** locale `en`, finds nothing,
 * and gets a 404. It also leaks the implementation detail (`/index.zh`) into
 * the URL.
 *
 * The slug must be stable across locales so the same URL resolves to the
 * matching translation. Strip the `.md` extension and any `.<locale>` infix:
 *
 *   index.zh.md      → index
 *   hello-world.md   → hello-world
 *   changelog.zh.md  → changelog
 *
 * Only suffixes present in `locales` are stripped, so a genuine dotted name
 * (`guide.zh-cn.md`, `guide.v2.md`) keeps its suffix instead of being
 * truncated. Exported for unit testing.
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
