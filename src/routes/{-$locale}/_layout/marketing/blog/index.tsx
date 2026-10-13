import { createFileRoute } from '@tanstack/react-router'
import { allBlogs } from 'content-collections'
import { PostCard } from '@/components/blog/PostCard'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/')({
  head: () =>
    seo('/blog', {
      title: m.blog_page_title(),
      description: m.blog_page_description(),
      locale: getLocale(),
    }),
  component: BlogIndex,
})

function BlogIndex() {
  const locale = getLocale()
  const posts = allBlogs
    .filter((p) => p.locale === locale && p.published)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((p) => ({
      slug: p._meta.path,
      title: p.title,
      description: p.description,
      date: p.date,
    }))
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{m.blog_page_title()}</h1>
      <div className="mt-6 grid gap-4">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </main>
  )
}
