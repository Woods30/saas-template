import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DocsLayout } from '@/components/docs/DocsLayout'
import type { Locale } from '@/lib/locale'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/docs')({
  component: DocsLayoutRoute,
})

function DocsLayoutRoute() {
  return (
    <DocsLayout locale={getLocale() as Locale}>
      <Outlet />
    </DocsLayout>
  )
}
