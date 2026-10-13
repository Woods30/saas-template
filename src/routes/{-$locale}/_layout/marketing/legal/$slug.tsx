import { createFileRoute, notFound } from '@tanstack/react-router'
import { allLegals } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/legal/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    const legal = allLegals.find((l) => {
      const path = l._meta.path
      return (
        (path === `${params.slug}.md` || path === `${params.slug}.${locale}.md`) &&
        l.locale === locale
      )
    })
    if (!legal) throw notFound()
    return { legal }
  },
  loader: ({ context }) => ({ title: context.legal.title }),
  head: ({ loaderData }) =>
    seo(`/legal/${loaderData?.title}`, {
      title: loaderData?.title ?? '',
      type: 'article',
      locale: getLocale(),
    }),
  component: LegalPage,
})

function LegalPage() {
  const { legal } = Route.useRouteContext()
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{legal.title}</h1>
      <hr className="my-6 border-border" />
      <Mdx source={legal.content} />
    </main>
  )
}
