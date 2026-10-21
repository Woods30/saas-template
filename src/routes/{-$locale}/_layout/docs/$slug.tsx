import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocNextSteps } from '@/components/docs/DocNextSteps'
import { DocPager } from '@/components/docs/DocPager'
import { DocsToc } from '@/components/docs/DocsToc'
import { Mdx } from '@/components/mdx/Mdx'
import {
  docNeighbors,
  docsForLocale,
  extractHeadings,
  findDocBySlug,
  formatUpdatedDate,
  splitNextSteps,
} from '@/lib/docs'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 单篇文档页。slug 与语言无关（见 `src/lib/docs.ts`）：URL 不泄漏语言后缀，
 * 切换语言后同一个 slug 仍能命中对应译文。
 */
export const Route = createFileRoute('/{-$locale}/_layout/docs/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getRequestLocale()
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
    return seo(`/docs/${loaderData.slug}`, {
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

  return (
    <div className="mx-auto flex max-w-5xl justify-center gap-10">
      <article className="max-w-3xl min-w-0 flex-1">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        {doc.updated !== '' && (
          <p className="mt-2 text-xs text-muted-foreground">
            {m.docs_updated_at()} {doc.updated}
          </p>
        )}
        <hr className="my-6 border-border" />
        <Mdx source={doc.body} />
        <DocNextSteps steps={doc.steps} locale={locale} />
        <DocPager locale={locale} prev={doc.prev} next={doc.next} />
      </article>
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 xl:block">
        <DocsToc headings={doc.headings} />
      </aside>
    </div>
  )
}
