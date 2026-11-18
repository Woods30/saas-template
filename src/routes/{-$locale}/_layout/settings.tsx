import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { PersonalCenterLayout } from '@/components/dashboard/DashboardLayout'
import { fetchSession } from '@/core/auth/session'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'

/**
 * 个人中心的受保护外壳（`/settings/*`）。
 *
 * `beforeLoad` 做模块门禁（`auth` 关闭时整棵子树 404）与会话校验，未登录重定向到登录页。
 * 会话必须经 `fetchSession` 读：cookie 是 httpOnly，客户端读不到。
 */
export const Route = createFileRoute('/{-$locale}/_layout/settings')({
  beforeLoad: async ({ params }) => {
    assertPageEnabled('auth')
    const session = await fetchSession()
    if (!session) {
      throw redirect({ to: '/{-$locale}/auth/login', params: { locale: params.locale } })
    }
    return { session }
  },
  component: PersonalCenterLayoutRoute,
})

function PersonalCenterLayoutRoute() {
  const { session } = Route.useRouteContext()
  return (
    <PersonalCenterLayout locale={getRequestLocale()} session={session}>
      <Outlet />
    </PersonalCenterLayout>
  )
}
