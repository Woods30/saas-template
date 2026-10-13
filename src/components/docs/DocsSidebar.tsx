import { Link } from '@tanstack/react-router'
import type { DocEntry } from '@/lib/docs'

/**
 * 文档侧边栏导航。条目由父级 `DocsLayout` 按当前语言解析后传入，
 * 本组件保持纯展示，不自行读取 locale。
 */
export function DocsSidebar({ docs }: { docs: DocEntry[] }) {
  return (
    <nav className="text-sm">
      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.slug}>
            <Link
              to="/{-$locale}/docs/$slug"
              params={{ slug: d.slug }}
              activeProps={{ className: 'bg-muted font-semibold text-foreground' }}
              className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
