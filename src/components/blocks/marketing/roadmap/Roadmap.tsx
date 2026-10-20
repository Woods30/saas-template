import { m } from '@/locale/paraglide/messages.js'
import type { RoadmapItem, RoadmapProps, RoadmapStatus } from './types'

/**
 * 状态标记的语义配色。
 *
 * 只用主题 token，不写死色值：`bg-primary` 跟随品牌色，`bg-muted-foreground` 表示
 * 尚未开始。深浅色主题都由 CSS 变量提供，无需在组件里判断。
 */
const STATUS_DOT: Record<RoadmapStatus, string> = {
  done: 'bg-primary',
  active: 'bg-primary ring-4 ring-primary/20',
  planned: 'bg-muted-foreground/40',
}

/** 状态文案随语言变化，因此在渲染时求值（`m.*()` 读取运行时 locale）。 */
function statusLabel(status: RoadmapStatus): string {
  switch (status) {
    case 'done':
      return m.roadmap_status_done()
    case 'active':
      return m.roadmap_status_active()
    case 'planned':
      return m.roadmap_status_planned()
  }
}

function RoadmapEntry({ item, last }: { item: RoadmapItem; last: boolean }) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {/* 竖线连到下一项；最后一项不画，避免尾部悬空。 */}
      {!last && (
        <span aria-hidden="true" className="absolute top-4 left-[5px] h-full w-px bg-border" />
      )}
      <span
        aria-hidden="true"
        className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          <span className="text-xs font-medium text-muted-foreground">
            {statusLabel(item.status)}
          </span>
          {item.eta && <span className="text-xs text-muted-foreground">{item.eta}</span>}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      </div>
    </li>
  )
}

export function Roadmap({ title, subtitle, items }: RoadmapProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <ol className="mt-10">
        {items.map((item, index) => (
          <RoadmapEntry
            key={`${item.status}-${item.title}`}
            item={item}
            last={index === items.length - 1}
          />
        ))}
      </ol>
    </section>
  )
}
