import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { fetchSession } from '@/auth/session'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'

/**
 * 个人中心的受保护外壳。
 *
 * `beforeLoad` 做模块门禁（`auth` 关闭时整棵子树 404）与会话校验，未登录重定向到登录页。
 * 会话必须经 `fetchSession` 读：cookie 是 httpOnly，客户端读不到。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard')({
  beforeLoad: async ({ params }) => {
    assertPageEnabled('auth')
    const session = await fetchSession()
    if (!session) {
      throw redirect({ to: '/{-$locale}/auth/login', params: { locale: params.locale } })
    }
    return { session }
  },
  component: DashboardLayoutRoute,
})

function DashboardLayoutRoute() {
  const { session } = Route.useRouteContext()
  return (
    <DashboardLayout locale={getRequestLocale()} session={session}>
      <Outlet />
    </DashboardLayout>
  )
}
