import { createFileRoute } from '@tanstack/react-router'
import { allBlogs, allDocs } from 'content-collections'
import type { WebsiteConfig } from '@/config/website'
import { websiteConfig } from '@/config/website'
import { contentSlug } from '@/lib/content-locale'
import { LOCALES, type Locale, parseLocale } from '@/lib/locale'

/** 单条 sitemap 记录：绝对 loc 与同页其他语言的 alternate 链接。 */
export interface SitemapEntry {
  loc: string
  alternates: Array<{ hreflang: Locale; href: string }>
}

/** 动态内容来源；缺省时读取构建期生成的博客 / 文档清单，便于单测注入。 */
export interface SitemapSource {
  blogs: ReadonlyArray<{
    locale: string
    published: boolean
    _meta: { path: string; fileName: string }
  }>
  docs: ReadonlyArray<{ locale: string; _meta: { fileName: string } }>
}

/** 默认内容来源：Content Collections 生成的清单。 */
function defaultSource(): SitemapSource {
  return { blogs: allBlogs, docs: allDocs }
}

/** 用站点基址拼装绝对 URL；path 缺省表示站点根。 */
function buildUrl(baseUrl: string, locale: Locale, path?: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return new URL(`/${locale}${path ?? ''}`, normalized).toString()
}

/**
 * 生成全部 sitemap 路径（纯函数，不读 env / 不发请求）。
 *
 * alternates 只在对方语言确实存在同 slug 内容时生成，不伪造缺失翻译；
 * 静态页在所有语言都存在，故包含除自身外的全部语言。
 */
export function getSitemapPaths(
  config: WebsiteConfig,
  locale: Locale,
  source: SitemapSource = defaultSource(),
): SitemapEntry[] {
  const baseUrl = config.baseUrl
  const entries: SitemapEntry[] = []

  // 所有语言都存在该静态页时，为除当前语言外的语言生成 alternate。
  const staticAlternates = (path?: string): SitemapEntry['alternates'] =>
    LOCALES.filter((l) => l !== locale).map((l) => ({
      hreflang: l,
      href: buildUrl(baseUrl, l, path),
    }))

  const pushStatic = (path?: string) => {
    entries.push({ loc: buildUrl(baseUrl, locale, path), alternates: staticAlternates(path) })
  }

  pushStatic()
  pushStatic('/marketing/features')
  pushStatic('/marketing/about')
  // roadmap / waitlist 是静态营销页，没有对应模块开关，因此无条件收录。
  pushStatic('/marketing/roadmap')
  pushStatic('/marketing/waitlist')
  pushStatic('/marketing/legal/terms')
  pushStatic('/marketing/legal/privacy')

  if (config.docs.enabled) pushStatic('/docs')
  if (config.blog.enabled) pushStatic('/marketing/blog')
  if (config.changelog.enabled) pushStatic('/marketing/changelog')
  if (config.contact.enabled) pushStatic('/marketing/contact')

  // 博客 slug 取 `_meta.path`，URL 前缀是真实路由 `/marketing/blog/`。
  if (config.blog.enabled) {
    const keyOf = (post: { _meta: { path: string; fileName: string } }) =>
      contentSlug(post._meta.fileName)
    for (const post of source.blogs) {
      if (post.locale !== locale || !post.published) continue
      const slug = post._meta.path
      const key = keyOf(post)
      const alternates = source.blogs
        .filter((b) => b.locale !== locale && b.published && keyOf(b) === key)
        .flatMap((b) => {
          // hreflang 必须是合法语言标签，不支持的取值宁可跳过也不写进 sitemap。
          const alt = parseLocale(b.locale)
          return alt
            ? [{ hreflang: alt, href: buildUrl(baseUrl, alt, `/marketing/blog/${b._meta.path}`) }]
            : []
        })
      entries.push({
        loc: buildUrl(baseUrl, locale, `/marketing/blog/${slug}`),
        alternates,
      })
    }
  }

  if (config.docs.enabled) {
    const slugOf = (doc: { _meta: { fileName: string } }) => contentSlug(doc._meta.fileName)
    for (const doc of source.docs) {
      if (doc.locale !== locale) continue
      const slug = slugOf(doc)
      const alternates = source.docs
        .filter((d) => d.locale !== locale && slugOf(d) === slug)
        .flatMap((d) => {
          const alt = parseLocale(d.locale)
          return alt ? [{ hreflang: alt, href: buildUrl(baseUrl, alt, `/docs/${slug}`) }] : []
        })
      entries.push({ loc: buildUrl(baseUrl, locale, `/docs/${slug}`), alternates })
    }
  }

  return entries
}

/** 对 XML 文本节点 / 属性值做转义，避免内容破坏文档结构。 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 把路径序列化为 sitemap XML；路由 handler 只做这一步。 */
export function renderSitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const alternates = entry.alternates
        .map(
          (a) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`,
        )
        .join('')
      return `<url><loc>${escapeXml(entry.loc)}</loc>${alternates}<changefreq>weekly</changefreq></url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const paths = LOCALES.flatMap((locale) => getSitemapPaths(websiteConfig, locale))
        return new Response(renderSitemapXml(paths), {
          headers: { 'Content-Type': 'application/xml' },
        })
      },
    },
  },
})
