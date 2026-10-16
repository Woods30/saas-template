import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { fetchSession } from '@/auth/session'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'

/**
 * 个人中心的受保护外壳。
 *
 * `beforeLoad` 做两件事：模块门禁（`auth` 关闭时整棵子树 404）与**会话校验**。
 * 未登录一律重定向到登录页——这是本仓第一条真正的路由守卫（此前的
 * `src/auth/middlewares.ts` 是死代码，且 redirect 目标缺 locale 参数）。
 *
 * 会话经 `fetchSession`（server function）读取：SSR 阶段就地求值，客户端导航时降级为
 * 一次 RPC。cookie 是 httpOnly 的，客户端读不到，`getAuth` 也需要每请求 env。
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
