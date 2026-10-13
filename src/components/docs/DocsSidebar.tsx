import { Link } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { getLocale } from '@/locale/paraglide/runtime.js'

export function DocsSidebar() {
  const locale = getLocale()
  const items = allDocs.filter((d) => d.locale === locale).sort((a, b) => a.order - b.order)
  return (
    <nav className="w-56 border-r border-border p-4 text-sm">
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d._meta.path}>
            <Link
              to="/{-$locale}/marketing/docs/$slug"
              params={{ slug: d._meta.path }}
              activeProps={{ className: 'font-semibold' }}
              className="hover:underline"
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
