import { createFileRoute, notFound } from '@tanstack/react-router'
import { allBlogs } from 'content-collections'
import { JsonLd } from '@/components/JsonLd'
import { Mdx } from '@/components/mdx/Mdx'
import { articleJsonLd } from '@/lib/json-ld'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/$slug')({
  beforeLoad: ({ params }) => {
    assertPageEnabled('blog')
    const locale = getLocale()
    const post = allBlogs.find(
      (p) => p._meta.path === params.slug && p.locale === locale && p.published,
    )
    if (!post) throw notFound()
    return { post }
  },
  loader: ({ context }) => ({
    title: context.post.title,
    description: context.post.description,
    path: context.post._meta.path,
  }),
  head: ({ loaderData }) =>
    seo(`/marketing/blog/${loaderData?.path}`, {
      title: loaderData?.title ?? '',
      description: loaderData?.description,
      type: 'article',
      locale: getLocale(),
    }),
  component: BlogPost,
})

function BlogPost() {
  const { post } = Route.useRouteContext()
  return (
    <>
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: post.description,
          date: post.date,
          path: `/marketing/blog/${post._meta.path}`,
        })}
      />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">{new Date(post.date).toLocaleDateString()}</p>
        <h1 className="mt-2 text-4xl font-bold">{post.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{post.description}</p>
        <hr className="my-6 border-border" />
        <Mdx source={post.content} />
      </main>
    </>
  )
}
