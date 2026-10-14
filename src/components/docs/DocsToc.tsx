import type { DocHeading } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 右侧「本页目录」。
 *
 * 列出当前文档的 h2 / h3 锚点。链接是**纯 `#id` 锚点**（不经过路由），因此点击
 * 只做页内滚动；id 与 `Mdx` 渲染标题时使用的 `headingId` 出自同一函数，两边一致。
 * 无标题时整块不渲染，避免留下一个空侧栏。
 */
export function DocsToc({ headings }: { headings: DocHeading[] }) {
  if (headings.length === 0) return null

  return (
    <nav className="text-sm" aria-label={m.docs_toc_title()}>
      <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {m.docs_toc_title()}
      </p>
      <ul className="space-y-0.5 border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              data-level={heading.level}
              className={`block border-l-2 border-transparent py-1 text-muted-foreground hover:border-border hover:text-foreground ${
                heading.level === 3 ? 'pl-6' : 'pl-3'
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
