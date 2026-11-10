import { createFileRoute } from '@tanstack/react-router'
import type { CollectionOrderStatus } from '@/collection/types'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 核销订单路由的父级：门禁、SEO 与列表页数据都在这里取。
 *
 * 这个文件**只做父级**，不渲染页面内容 —— TanStack 文件路由把 `orders/` 目录
 * 下的 `index.tsx`（列表）与 `$orderId.tsx`（详情）当作它的子路由，父组件
 * 不写 `component` 时默认渲染 `<Outlet />`。如果在父组件里直接渲染列表而不
 * 输出 Outlet，子路由永远挂不上：URL 变成详情页、页面仍是列表，症状是
 * 「导航成功但页面不切换」。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/orders')({
  beforeLoad: () => assertPageEnabled('collection'),
  head: () =>
    seo('/dashboard/orders', {
      title: m['collection.order_list_title'](),
      description: m['collection.order_list_description'](),
      locale: getRequestLocale(),
      noindex: true,
    }),
})

/**
 * 订单状态 → 文案键。文案在渲染期经 `m[key]()` 求值。
 *
 * 不写 `: string` 返回注解：TS 要从字面量推断消息键联合才能索引 `m`，
 * 收宽成 `string` 会丢失索引权限（与 `billing-query.ts` 同一套约定）。
 */
export function collectionOrderStatusMessageKey(status: CollectionOrderStatus) {
  switch (status) {
    case 'pending_payment':
      return 'collection.order_status_pending_payment'
    case 'pending_verification':
      return 'collection.order_status_pending_verification'
    case 'settling':
      return 'collection.order_status_settling'
    case 'settled':
      return 'collection.order_status_settled'
    case 'expired':
      return 'collection.order_status_expired'
    case 'canceled':
      return 'collection.order_status_canceled'
    case 'rejected':
      return 'collection.order_status_rejected'
    case 'requires_refund':
      return 'collection.order_status_requires_refund'
  }
}
