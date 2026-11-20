import { allBlogs } from 'content-collections'
import { PostCard } from '@/components/blog/PostCard'
import { m } from '@/locale/paraglide/messages.js'

/** 博客列表区块：按 locale 过滤已发布文章并倒序排列。 */
export function BlogList({ locale }: { locale: string }) {
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
          <PostCard key={p.slug} post={p} locale={locale} />
        ))}
      </div>
    </main>
  )
}
