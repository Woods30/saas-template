import { Link } from '@tanstack/react-router'
import { formatUtcDate } from '@/lib/datetime'
import type { Post } from './types'

export function PostCard({ post, locale }: { post: Post; locale: string }) {
  return (
    <Link
      to="/{-$locale}/marketing/blog/$slug"
      params={{ slug: post.slug }}
      className="block rounded border border-border p-4 hover:bg-muted/40"
    >
      {/* 发布日按 UTC 渲染：文章日期记的是「日历日」，西半球不该显示成前一天。 */}
      <p className="text-xs text-muted-foreground">{formatUtcDate(post.date, locale)}</p>
      <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{post.description}</p>
    </Link>
  )
}
