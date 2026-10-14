import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DocsLayout } from '@/components/docs/DocsLayout'
import type { Locale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/docs')({
  // docs 模块统一门禁：关闭时整棵 docs 子树以 404 呈现。
  beforeLoad: () => assertPageEnabled('docs'),
  component: DocsLayoutRoute,
})

function DocsLayoutRoute() {
  return (
    <DocsLayout locale={getLocale() as Locale}>
      <Outlet />
    </DocsLayout>
  )
}
