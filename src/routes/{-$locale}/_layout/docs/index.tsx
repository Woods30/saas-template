import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DocArticle } from '@/components/docs/DocArticle'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import {
  DOCS_INDEX_SLUG,
  docNeighbors,
  docsForLocale,
  docsLanding,
  docsPublicPath,
  extractHeadings,
  findDocBySlug,
  formatUpdatedDate,
  splitNextSteps,
} from '@/modules/docs/service'

/**
 * 文档首页：渲染 `index.md` / `index.zh.md`（slug 恒为 `index`）。
 *
 * 首页的正式地址是 `/docs`，不是 `/docs/index`——`/docs/index` 会被重定向到这里，
 * 避免同一篇内容有两个 URL。
 */
export const Route = createFileRoute('/{-$locale}/_layout/docs/')({
  beforeLoad: () => {
    const locale = getRequestLocale()
    const doc = findDocBySlug(DOCS_INDEX_SLUG, locale)
    if (doc) return { doc, locale }

    // 没有首页文档时回退到第一篇：文档站仍要有个入口，不能 404。
    const landing = docsLanding(locale)
    if (!landing) throw notFound()
    throw redirect({
      to: '/{-$locale}/docs/$slug',
      params: { locale, slug: landing.slug },
    })
  },
  loader: ({ context }) => {
    const { body, steps } = splitNextSteps(context.doc.content)
    const neighbors = docNeighbors(docsForLocale(context.locale), DOCS_INDEX_SLUG)

    return {
      title: context.doc.title,
      description: context.doc.description,
      body,
      steps,
      prev: neighbors.prev,
      next: neighbors.next,
      // 格式化依赖当前语言，必须按请求求值。
      updated: formatUpdatedDate(context.doc.updated, context.locale),
      headings: extractHeadings(body),
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [], links: [] }
    return seo(docsPublicPath(undefined, websiteConfig.docs.asHome === true), {
      title: loaderData.title,
      description: loaderData.description,
      type: 'article',
      locale: getRequestLocale(),
    })
  },
  component: DocsIndexPage,
})

function DocsIndexPage() {
  const doc = Route.useLoaderData()
  const { locale } = Route.useRouteContext()

  return <DocArticle doc={doc} locale={locale} />
}
