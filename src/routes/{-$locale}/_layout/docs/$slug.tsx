import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DocArticle } from '@/components/docs/DocArticle'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import {
  DOCS_INDEX_SLUG,
  docNeighbors,
  docsForLocale,
  docsPublicPath,
  extractHeadings,
  findDocBySlug,
  formatUpdatedDate,
  splitNextSteps,
} from '@/modules/docs/service'

/**
 * 单篇文档页。slug 与语言无关（见 `src/modules/docs/service.ts`）：URL 不泄漏语言后缀，
 * 切换语言后同一个 slug 仍能命中对应译文。
 */
export const Route = createFileRoute('/{-$locale}/_layout/docs/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getRequestLocale()

    // 文档首页的正式地址是 `/docs`；`/docs/index` 只是历史地址，重定向过去，
    // 免得同一篇内容有两个可索引的 URL。
    if (params.slug === DOCS_INDEX_SLUG) {
      throw redirect({ to: '/{-$locale}/docs', params: { locale } })
    }

    const doc = findDocBySlug(params.slug, locale)
    if (!doc) throw notFound()
    return { doc, locale }
  },
  loader: ({ context, params }) => {
    // 派生结果在 loader 里算好：解析正文不该出现在渲染路径上。
    const { body, steps } = splitNextSteps(context.doc.content)
    const neighbors = docNeighbors(docsForLocale(context.locale), params.slug)

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
      slug: params.slug,
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [], links: [] }
    return seo(docsPublicPath(loaderData.slug, websiteConfig.docs.asHome === true), {
      title: loaderData.title,
      description: loaderData.description,
      type: 'article',
      locale: getRequestLocale(),
    })
  },
  component: DocPage,
})

function DocPage() {
  const doc = Route.useLoaderData()
  const { locale } = Route.useRouteContext()

  return <DocArticle doc={doc} locale={locale} />
}
