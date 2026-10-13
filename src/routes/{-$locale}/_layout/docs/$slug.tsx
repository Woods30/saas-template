import { createFileRoute, notFound } from '@tanstack/react-router'
import { Mdx } from '@/components/mdx/Mdx'
import type { Locale } from '@/lib/locale'
import { findDocBySlug } from '@/lib/docs'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

/**
 * 单篇文档页。slug 与语言无关（见 `src/lib/docs.ts`），因此：
 * - URL 不泄漏 `.zh` 之类的语言后缀（`/docs/getting-started`）；
 * - 切换语言后同一个 slug 仍能命中对应译文，不再 404。
 */
export const Route = createFileRoute('/{-$locale}/_layout/docs/$slug')({
  beforeLoad: ({ params }) => {
    const doc = findDocBySlug(params.slug, getLocale() as Locale)
    if (!doc) throw notFound()
    return { doc }
  },
  loader: ({ context }) => ({
    title: context.doc.title,
    description: context.doc.description,
    content: context.doc.content,
  }),
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [], links: [] }
    return seo(`/docs/${loaderData.title}`, {
      title: loaderData.title,
      description: loaderData.description,
      type: 'article',
      locale: getLocale() as Locale,
    })
  },
  component: DocPage,
})

function DocPage() {
  const doc = Route.useLoaderData()
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold">{doc.title}</h1>
      <p className="mt-2 text-muted-foreground">{doc.description}</p>
      <hr className="my-6 border-border" />
      <Mdx source={doc.content} />
    </article>
  )
}
