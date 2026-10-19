import { useEffect, useState } from 'react'
import type { DocHeading } from '@/lib/docs'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 右侧「本页目录」。
 *
 * 列出当前文档的 h2 / h3 锚点。链接是**纯 `#id` 锚点**（不经过路由），因此点击
 * 只做页内滚动；id 与 `Mdx` 渲染标题时使用的 `headingId` 出自同一函数，两边一致。
 * 无标题时整块不渲染，避免留下一个空侧栏。
 *
 * **当前小节高亮**（参照 docs.tanstarter.dev）：阅读位置落在哪个标题之后，对应目录项
 * 就用前景色 + 加粗 + 左侧强调边框标出。没有它，长文档里目录只是一张静态清单，
 * 读者无法回答「我现在读到哪一节」。
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
      {/* 树状竖线（参照 docs.tanstarter.dev）：
          - 一条竖线贯穿整个目录，h2 紧贴竖线右侧；
          - h3 缩进一级，另有一条**短横线**从竖线伸出接住它；
          - 当前项把竖线的那一段**点亮**成强调色，作为「读到哪了」的标记。
          仅靠 `padding-left` 缩进时，层级只能靠「谁更靠右」猜；接上短横线后，
          「这一项属于上面哪一节」是视觉上直接可读的。 */}
      <ul className="border-l border-border">
        {headings.map((heading) => {
          const isActive = heading.id === activeId
          return (
            <li key={heading.id} className="relative">
              {/* 当前项：在贯穿竖线上覆盖一段强调色（`-left-px` 正好压住 1px 边框）。
                  用竖线高亮而不是圆点——高亮段与竖线同宽同位置，目录的「线」始终连续，
                  视线不会被一个突兀的圆点打断。 */}
              {isActive && (
                <span
                  aria-hidden
                  data-active-bar=""
                  className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-primary"
                />
              )}
              {/* h3 的连接线：从竖线出发、指向文字，位于缩进区间内。
                  当前项时一并换成强调色——竖线已高亮，接出来的横线仍是灰色会断成一截。 */}
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
                // `aria-current="location"`：告诉读屏软件这一项是当前位置，
                // 而不只是「看起来换了颜色」。
                aria-current={isActive ? 'location' : undefined}
                className={`block py-1.5 transition-colors ${heading.level === 3 ? 'pl-5' : 'pl-3'} ${
                  // 当前项加粗 + 强调色：参考站靠「橙色文字 + 竖线高亮」两重信号，
                  // 只换颜色在浅色主题下辨识度不够（实测与 hover 态难区分）。
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
 * 跟踪当前阅读位置所在的标题。
 *
 * 用滚动位置而不是 `IntersectionObserver`：目录项要表达的是「最后一个已经越过的
 * 标题」，这是页面上的**顺序**关系，靠滚动阈值一次算出比维护一组进入/离开视口的
 * 交叉状态更直接，也不会在两节同时可见时抖动。
 *
 * 滚到底部时强制点亮最后一节——最后一节常常太短，永远越不过阈值，否则读者读到
 * 文末会发现目录里没有一项是高亮的。
 */
function useActiveHeading(headings: DocHeading[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null)

  useEffect(() => {
    if (headings.length === 0) return

    function update() {
      const scrollHeight = document.documentElement.scrollHeight
      // `scrollHeight` 为 0 说明页面还没布局（或测试环境不做布局），此时
      // `0 >= -2` 恒真，会把最后一节误判成「已到底」。
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
    // `passive`：滚动监听不该阻塞合成线程。
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [headings])

  return activeId
}
