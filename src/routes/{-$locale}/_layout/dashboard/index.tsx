import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/dashboard` 本身不是内容页：进入工作台一律落到「资料」板块。
 * 用 `redirect` 而非渲染重定向组件，避免在历史记录里留下一个空中间页。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/{-$locale}/dashboard/profile', params: { locale: params.locale } })
  },
})
