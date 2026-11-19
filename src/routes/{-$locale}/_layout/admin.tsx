import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminConsoleLayout } from '@/components/admin/AdminConsoleLayout'
import { fetchSession } from '@/core/auth/session'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminAccess } from '@/lib/module-access'

/**
 * 管理台的受保护外壳（`/admin/*`）。
 *
 * 两层门禁都在这儿生效，子页面不必重复做「是不是管理台」的判断：
 * - 未登录 → 跳登录页；
 * - 不持有任何 `admin.*` 权限 → 404。
 *
 * 目标权限点而不是角色：`editor`（内容 / 工单运营）同样属于管理台用户，
 * 具体能看到什么由各子页面与 server function 的权限点决定。
 *
 * 会话必须经 `fetchSession` 读：cookie 是 httpOnly，客户端读不到。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin')({
  beforeLoad: async ({ params }) => {
    const session = await fetchSession()
    if (!session) {
      throw redirect({ to: '/{-$locale}/auth/login', params: { locale: params.locale } })
    }
    assertAdminAccess(session.permissions)
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
