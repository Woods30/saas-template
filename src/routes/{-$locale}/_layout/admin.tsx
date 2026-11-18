import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminConsoleLayout } from '@/components/dashboard/DashboardLayout'
import { fetchSession } from '@/core/auth/session'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled, assertPageEnabled } from '@/lib/module-access'

/**
 * 管理台的受保护外壳（`/admin/*`）。
 *
 * 三层门禁都在这儿生效，子页面不必重复做「是不是管理台」的判断：
 * - `auth` 模块关闭 → 整棵子树 404；
 * - 未登录 → 跳登录页；
 * - 非管理员或 `enableAdmin` 关闭 → 403。
 *
 * 会话必须经 `fetchSession` 读：cookie 是 httpOnly，客户端读不到。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin')({
  beforeLoad: async ({ params }) => {
    assertPageEnabled('auth')
    const session = await fetchSession()
    if (!session) {
      throw redirect({ to: '/{-$locale}/auth/login', params: { locale: params.locale } })
    }
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(session.user.role)
    return { session }
  },
  component: AdminConsoleLayoutRoute,
})

function AdminConsoleLayoutRoute() {
  const { session } = Route.useRouteContext()
  return (
    <AdminConsoleLayout locale={getRequestLocale()} session={session}>
      <Outlet />
    </AdminConsoleLayout>
  )
}
