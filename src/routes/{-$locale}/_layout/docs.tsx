import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DocsLayout } from '@/components/docs/DocsLayout'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'

export const Route = createFileRoute('/{-$locale}/_layout/docs')({
  // docs 模块统一门禁：关闭时整棵 docs 子树以 404 呈现。
  beforeLoad: () => assertPageEnabled('docs'),
  component: DocsLayoutRoute,
})

function DocsLayoutRoute() {
  return (
    <DocsLayout locale={getRequestLocale()}>
      <Outlet />
    </DocsLayout>
  )
}
