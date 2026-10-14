import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { DocNeighbor } from '@/lib/docs'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 文档底部的上一篇 / 下一篇导航。
 *
 * 阅读顺序沿 `order` 全局推进（跨分组连续，见 `docNeighbors`），因此「下一篇」会
 * 一路走完整个文档集，不在组边界停住。首篇只有下一篇、末篇只有上一篇。
 *
 * 用 `grid` 固定两列：只有一侧时该侧仍占位，卡片不会因为「上一篇」消失而跳位。
 */
export function DocPager({
  locale,
  prev,
  next,
}: {
  locale: Locale
  prev?: DocNeighbor
  next?: DocNeighbor
}) {
  if (!prev && !next) return null

  return (
    <nav className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
      {prev ? (
        <PagerLink dir="prev" doc={prev} locale={locale} />
      ) : (
        // 占位元素：只有一侧时保持两列布局，避免卡片跳位。
        <div />
      )}
      {next ? <PagerLink dir="next" doc={next} locale={locale} /> : <div />}
    </nav>
  )
}

function PagerLink({
  dir,
  doc,
  locale,
}: {
  dir: 'prev' | 'next'
  doc: DocNeighbor
  locale: Locale
}) {
  const isNext = dir === 'next'
  const Icon = isNext ? IconArrowRight : IconArrowLeft

  return (
    <Link
      to="/{-$locale}/docs/$slug"
      params={{ slug: doc.slug, locale }}
      className={`group flex flex-col gap-1 rounded-lg border border-border px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-muted/40 ${
        isNext ? 'items-end text-right sm:col-start-2' : 'items-start'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {!isNext && <Icon className="size-3.5" aria-hidden />}
        {isNext ? m.docs_next() : m.docs_prev()}
        {isNext && <Icon className="size-3.5" aria-hidden />}
      </span>
      <span className="max-w-full truncate text-sm font-medium">{doc.title}</span>
    </Link>
  )
}
