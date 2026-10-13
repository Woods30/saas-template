import { Link } from '@tanstack/react-router'
import type { Post } from './types'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link
      to="/{-$locale}/marketing/blog/$slug"
      params={{ slug: post.slug }}
      className="block rounded border border-border p-4 hover:bg-muted/40"
    >
      <p className="text-xs text-muted-foreground">{new Date(post.date).toLocaleDateString()}</p>
      <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{post.description}</p>
    </Link>
  )
}
