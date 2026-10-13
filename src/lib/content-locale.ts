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
 * Use `_meta.fileName` so the suffix `.zh.md` is present, and only treat the
 * file as Chinese when it explicitly carries the `.zh.` infix — anything
 * else (including future locales like `ja` / `fr`) defaults to `en`.
 *
 * Exported for unit testing so the transform behavior is pinned.
 *
 * @param fileName - `_meta.fileName` from a Content Collections document
 * @returns `'zh'` if the file is a Chinese source, `'en'` otherwise
 */
export function resolveContentLocale(fileName: string): 'en' | 'zh' {
  return fileName.endsWith('.zh.md') ? 'zh' : 'en'
}
