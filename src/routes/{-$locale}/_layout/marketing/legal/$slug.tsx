import { createFileRoute, notFound } from '@tanstack/react-router'
import { allLegals } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { contentSlug } from '@/lib/content-locale'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/legal/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    // 必须用 `contentSlug(fileName)` 归一化：`_meta.path` 已剥离 `.md`，
    // 拼 `${slug}.md` 永远匹配不上。
    const legal = allLegals.find(
      (l) => contentSlug(l._meta.fileName) === params.slug && l.locale === locale,
    )
    if (!legal) throw notFound()
    return { legal }
  },
  loader: ({ context, params }) => ({ title: context.legal.title, slug: params.slug }),
  head: ({ loaderData }) =>
    seo(`/marketing/legal/${loaderData?.slug}`, {
      title: loaderData?.title ?? '',
      type: 'article',
      locale: getLocale(),
      pageType: 'WebPage',
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
