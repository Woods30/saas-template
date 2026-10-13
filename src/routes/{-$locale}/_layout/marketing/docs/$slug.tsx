import { createFileRoute, notFound } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { Mdx } from '@/components/mdx/Mdx'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    const doc = allDocs.find((d) => d._meta.path === params.slug && d.locale === locale)
    if (!doc) throw notFound()
    return { doc }
  },
  loader: ({ context }) => {
    const doc = context.doc
    return {
      title: doc.title,
      description: doc.description,
      content: doc.content,
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [], links: [] }
    return seo(`/docs/${loaderData.title}`, {
      title: loaderData.title,
      description: loaderData.description,
      type: 'article',
      locale: getLocale(),
    })
  },
  component: DocPage,
})

function DocPage() {
  const doc = Route.useLoaderData()
  return (
    <div className="flex min-h-screen">
      <DocsSidebar />
      <article className="flex-1 px-8 py-10">
        <h1 className="text-3xl font-bold">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        <hr className="my-6 border-border" />
        <Mdx source={doc.content} />
      </article>
    </div>
  )
}
