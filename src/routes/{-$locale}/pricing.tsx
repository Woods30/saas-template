import { createFileRoute, redirect } from '@tanstack/react-router'

/** 定价统一展示于首页；保留旧地址供书签与历史链接跳转。 */
export const Route = createFileRoute('/{-$locale}/pricing')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/{-$locale}',
      params: { locale: params.locale },
      hash: 'pricing',
      replace: true,
    })
  },
})
