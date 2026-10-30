import { allBlogs, allChangelogs, allDocs, allLegals } from 'content-collections'
import { contentSlug } from '@/lib/content-locale'
import { DOCS_INDEX_SLUG } from '@/lib/docs'
import type { LlmsContentSource, LlmsEntry } from '@/lib/llms'

/**
 * llms 文件的默认内容来源：读构建期生成的 Content Collections 清单。
 *
 * 单独放在 `.server.ts`：`src/lib/llms.ts` 的渲染函数保持纯函数、零外部依赖，
 * 单测可以直接注入内容源。
 */

/** 把 ISO 时间截到日期部分（`YYYY-MM-DD`）。 */
function toDate(value: string): string {
  return value.slice(0, 10)
}

/** 文档：slug 与语言无关，URL 不泄漏语言后缀。 */
function toDocEntries(): LlmsEntry[] {
  return allDocs.map((doc) => ({
    // 文档首页渲染在 `/docs` 本身，不在 `/docs/index`。
    path:
      doc._meta.fileName && contentSlug(doc._meta.fileName) === DOCS_INDEX_SLUG
        ? '/docs'
        : `/docs/${contentSlug(doc._meta.fileName)}`,
    locale: doc.locale,
    title: doc.title,
    description: doc.description,
    content: doc.content ?? '',
    order: doc.order,
    group: doc.group ?? '',
    updated: doc.updated ?? '',
  }))
}

/** 博客条目的最小输入形态；便于单测注入假数据。 */
export interface BlogSourceEntry {
  locale: string
  published: boolean
  title: string
  description: string
  content?: string
  date: string
  _meta: { path: string }
}

/**
 * 博客：slug 用 `_meta.path`，与路由匹配 `params.slug` 的方式一致。
 *
 * 必须过滤 `published`——未发布的草稿在站内页面上不可见，进 llms 文件等于
 * 绕过发布流程把它公开出去。sitemap 同样只收已发布文章。
 */
export function toBlogEntries(posts: readonly BlogSourceEntry[] = allBlogs): LlmsEntry[] {
  return [...posts]
    .filter((post) => post.published)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((post, index) => ({
      path: `/marketing/blog/${post._meta.path}`,
      locale: post.locale,
      title: post.title,
      description: post.description,
      content: post.content ?? '',
      order: index,
      group: '',
      updated: toDate(post.date),
    }))
}

/**
 * 更新日志：站点只有一个列表页，没有单篇路由，
 * 所以全部条目共用 `/marketing/changelog` 这个 URL。
 */
function toChangelogEntries(): LlmsEntry[] {
  return [...allChangelogs]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((entry, index) => ({
      path: '/marketing/changelog',
      locale: entry.locale,
      title: entry.title,
      description: entry.summary,
      content: entry.content ?? '',
      order: index,
      group: '',
      updated: toDate(entry.date),
    }))
}

/** 法务条款：有单篇路由，slug 与语言无关。 */
function toLegalEntries(): LlmsEntry[] {
  return allLegals.map((legal) => ({
    path: `/marketing/legal/${contentSlug(legal._meta.fileName)}`,
    locale: legal.locale,
    title: legal.title,
    description: '',
    content: legal.content ?? '',
    order: 0,
    group: '',
    updated: '',
  }))
}

/** 全部内容的默认来源。 */
export function defaultLlmsSource(): LlmsContentSource {
  return {
    docs: toDocEntries(),
    blogs: toBlogEntries(),
    changelogs: toChangelogEntries(),
    legals: toLegalEntries(),
  }
}
