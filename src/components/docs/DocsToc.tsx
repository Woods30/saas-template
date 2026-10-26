import { useEffect, useState } from 'react'
import type { DocHeading } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 右侧「本页目录」：h2 / h3 锚点，纯 `#id` 链接不经过路由，id 与 `Mdx` 的
 * `headingId` 同源。无标题时整块不渲染。
 */

/** 判定「已读过」的滚动阈值：标题越过视口顶部这么多像素后算作当前小节。 */
const ACTIVE_OFFSET_PX = 120

export function DocsToc({ headings }: { headings: DocHeading[] }) {
  const activeId = useActiveHeading(headings)

  if (headings.length === 0) return null

  return (
    <nav className="text-sm" aria-label={m.docs_toc_title()}>
      <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {m.docs_toc_title()}
      </p>
      {/* h3 用短横线从竖线接出，否则层级只能靠缩进猜它属于哪一节。 */}
      <ul className="border-l border-border">
        {headings.map((heading) => {
          const isActive = heading.id === activeId
          return (
            <li key={heading.id} className="relative">
              {/* `-left-px` 正好压住 1px 边框，让高亮段与竖线重合。 */}
              {isActive && (
                <span
                  aria-hidden
                  data-active-bar=""
                  className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-primary"
                />
              )}
              {/* 当前项时横线一并换色，否则与高亮的竖线断成两截。 */}
              {heading.level === 3 && (
                <span
                  aria-hidden
                  data-connector=""
                  className={`absolute top-1/2 left-0 h-px w-2.5 -translate-y-1/2 ${
                    isActive ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <a
                href={`#${heading.id}`}
                data-level={heading.level}
                // 告诉读屏软件当前位置，而不只是视觉换色。
                aria-current={isActive ? 'location' : undefined}
                className={`block py-1.5 transition-colors ${heading.level === 3 ? 'pl-5' : 'pl-3'} ${
                  // 只换颜色在浅色主题下与 hover 态难区分，故再加粗。
                  isActive
                    ? 'font-medium text-primary'
                    : 'font-normal text-muted-foreground hover:text-foreground'
                }`}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * 跟踪当前阅读位置的标题。用滚动阈值而非 `IntersectionObserver`：需要的是
 * 「最后一个已越过的标题」这一顺序关系，且两节同时可见时不会抖动。
 * 滚到底部强制点亮最后一节，否则短小节永远越不过阈值。
 */
function useActiveHeading(headings: DocHeading[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null)

  useEffect(() => {
    if (headings.length === 0) return

    function update() {
      const scrollHeight = document.documentElement.scrollHeight
      // `scrollHeight` 为 0 说明页面还没布局，不加守卫会把最后一节误判成「已到底」。
      const atBottom = scrollHeight > 0 && window.innerHeight + window.scrollY >= scrollHeight - 2
      if (atBottom) {
        setActiveId(headings[headings.length - 1]?.id ?? null)
        return
      }

      let current = headings[0]?.id ?? null
      for (const heading of headings) {
        const element = document.getElementById(heading.id)
        if (!element) continue
        if (element.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = heading.id
        else break
      }
      setActiveId(current)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [headings])

  return activeId
}
