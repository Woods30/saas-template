import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { PersonalCenterLayout } from '@/components/settings/PersonalCenterLayout'
import { fetchSession } from '@/core/auth/session'
import { getRequestLocale } from '@/lib/locale'

/**
 * 个人中心的受保护外壳（`/settings/*`）。
 *
 * `beforeLoad` 做会话校验，未登录重定向到登录页。认证没有总开关，登录方式由方法
 * 开关决定，不再有整棵子树 404 的分支。
 * 会话必须经 `fetchSession` 读：cookie 是 httpOnly，客户端读不到。
 */
export const Route = createFileRoute('/{-$locale}/_layout/settings')({
  beforeLoad: async ({ params }) => {
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
