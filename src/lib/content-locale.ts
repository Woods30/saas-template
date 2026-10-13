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
 * Exported for unit testing.
 *
 * @param fileName - `_meta.fileName` from a Content Collections document
 * @returns The locale-independent slug used in URLs and lookups
 */
export function contentSlug(fileName: string): string {
  // Drop the markdown extension first, then any trailing locale segment.
  return fileName.replace(/\.md$/, '').replace(/\.(?:zh|en)$/, '')
}

