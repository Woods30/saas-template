import { createFileRoute, notFound } from '@tanstack/react-router'
import { allLegals } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { contentSlug } from '@/lib/content-locale'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/legal/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    // Content Collections 的 `_meta.path` 已剥离 `.md`（如 `terms` / `terms.zh`），
    // 用它拼 `${slug}.md` 永远匹配不上。改用 `contentSlug(fileName)` 得到与语言
    // 无关的 slug（`terms.md` 与 `terms.zh.md` 都归一为 `terms`），再配合
    // `locale` 选中当前语言的译文 —— 与 `src/lib/docs.ts` / sitemap 同一做法。
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
