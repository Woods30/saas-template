import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings` 本身不是内容页：进入个人中心一律落到「资料」板块。
 * 用 `redirect` 而非渲染重定向组件，避免在历史记录里留下一个空中间页。
 */
export const Route = createFileRoute('/{-$locale}/_layout/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/{-$locale}/settings/profile', params: { locale: params.locale } })
  },
})
