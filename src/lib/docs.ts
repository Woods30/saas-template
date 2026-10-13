/**
 * 文档（docs）路由的共享逻辑。
 *
 * Content Collections 的 `_meta.path` 只剥掉末尾 `.md`，因此 `index.zh.md`
 * 得到 `index.zh` —— 一个与语言绑定的 slug。用它做路由会引发两个问题：
 *
 * 1. **切换语言 404**：访问 `/docs/index.zh` 后切到英文，查找「slug 为
 *    `index.zh` 且 locale 为 en」的文档，找不到 → 404。
 * 2. **URL 泄漏实现细节**：`/docs/index.zh` 这种地址对用户不友好。
 *
 * 解决方式：路由与链接统一使用**与语言无关**的 slug（见
 * `contentSlug()`），语言只由 cookie 决定。同一个 URL 在两种语言下都
 * 能命中对应的译文。
 */

import { allDocs } from 'content-collections'
import type { Locale } from '@/lib/locale'
import { contentSlug } from '@/lib/content-locale'

/** 文档条目的最小投影，供侧边栏与页面渲染共用。 */
export interface DocEntry {
  slug: string
  title: string
  description: string
  content: string
  order: number
}

/** 文档首页（`index.md` / `index.zh.md`）的 slug；该文档渲染在 `/docs` 本身。 */
export const DOCS_INDEX_SLUG = 'index'

/** 把 Content Collections 文档投影成路由使用的 {@link DocEntry}。 */
function toEntry(doc: (typeof allDocs)[number]): DocEntry {
  return {
    slug: contentSlug(doc._meta.fileName),
    title: doc.title,
    description: doc.description,
    content: doc.content ?? '',
    order: doc.order,
  }
}

/** 返回指定语言的全部文档，按 `order` 升序。 */
export function docsForLocale(locale: Locale): DocEntry[] {
  return allDocs
    .filter((d) => d.locale === locale)
    .map(toEntry)
    .sort((a, b) => a.order - b.order)
}

/** 按与语言无关的 slug 查找文档；找不到返回 `undefined`。 */
export function findDocBySlug(slug: string, locale: Locale): DocEntry | undefined {
  return docsForLocale(locale).find((d) => d.slug === slug)
}

/**
 * 文档首页条目：优先取 slug 为 `index` 的文档，否则取排序后的第一篇，
 * 都没有时返回 `undefined`。
 */
export function docsLanding(locale: Locale): DocEntry | undefined {
  const docs = docsForLocale(locale)
  return docs.find((d) => d.slug === DOCS_INDEX_SLUG) ?? docs[0]
}
