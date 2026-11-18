import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDate } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { settingsRoutes } from '@/config/routes'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { type CollectionOrder, fetchMyCollectionOrders } from '@/modules/manual-payments/service'
import { productNameForProductId } from '@/modules/subscriptions/service'
import { collectionOrderStatusMessageKey } from '../orders'

/**
 * 用户自己的核销订单列表（`/settings/orders` 的 index 子路由）。
 *
 * 父路由 `orders.tsx` 只承担门禁与 SEO；列表数据在这里取。与 `billing` 页同一
 * 套路：数据在 loader 一次取回，失败交给页面渲染提示。
 */
export const Route = createFileRoute('/{-$locale}/_layout/settings/orders/')({
  loader: async () => {
    try {
      const result = await fetchMyCollectionOrders()
      return result.kind === 'ok'
        ? { ok: true as const, page: result.page }
        : { ok: false as const, page: null }
    } catch {
      return { ok: false as const, page: null }
    }
  },
  component: OrdersPage,
})

function OrdersPage() {
  const loaded = Route.useLoaderData()
  const locale = getRequestLocale()
  const rows = loaded.ok ? (loaded.page?.rows ?? []) : []

  const columns = useMemo<DataTableColumn<CollectionOrder>[]>(
    () => [
      {
        id: 'id',
        header: m['collection.order_col_id'](),
        className: 'font-mono text-xs',
        cell: (order) => order.id,
      },
      {
        id: 'product',
        header: m['collection.order_col_product'](),
        cell: (order) => productNameForProductId(order.productId) ?? order.productId,
      },
      {
        id: 'amount',
        header: m['collection.order_col_amount'](),
        cell: (order) => formatMoney(order.payableAmount, order.currency, locale),
      },
      {
        id: 'status',
        header: m['collection.order_col_status'](),
        cell: (order) => <Badge>{m[collectionOrderStatusMessageKey(order.status)]()}</Badge>,
      },
      {
        id: 'createdAt',
        header: m['collection.order_col_created'](),
        cell: (order) => <LocalDate value={order.createdAt} locale={locale} />,
      },
      {
        id: 'actions',
        header: m['collection.order_col_actions'](),
        className: 'text-right',
        cell: (order) => (
          // `nativeButton={false}`：Base UI 的 Button 默认渲染 <button>，
          // 换成 <a> 后必须关掉，否则开发环境会警告「丢了原生按钮语义」。
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={settingsRoutes.orderDetail} params={{ locale, orderId: order.id }} />}
          >
            {m['collection.order_view_detail']()}
          </Button>
        ),
      },
    ],
    [locale],
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowKey={(order) => order.id}
      error={loaded.ok ? null : m.settings_error_generic()}
      emptyTitle={m['collection.order_list_empty']()}
    />
  )
}
