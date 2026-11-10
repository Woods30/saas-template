import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchMyCollectionOrders } from '@/collection/client'
import { formatMoneyAmount } from '@/collection/pricing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { productNameForProductId } from '@/payment/billing-query'
import { collectionOrderStatusMessageKey } from '../orders'

/**
 * 用户自己的核销订单列表（`/dashboard/orders` 的 index 子路由）。
 *
 * 父路由 `orders.tsx` 只承担门禁与 SEO；列表数据在这里取。与 `billing` 页同一
 * 套路：数据在 loader 一次取回，失败交给页面渲染提示。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/orders/')({
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
  head: () =>
    seo('/dashboard/orders', {
      title: m['collection.order_list_title'](),
      description: m['collection.order_list_description'](),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: OrdersPage,
})

function OrdersPage() {
  const loaded = Route.useLoaderData()
  const locale = getRequestLocale()
  const rows = loaded.ok ? (loaded.page?.rows ?? []) : []

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{m['collection.order_list_title']()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {m['collection.order_list_description']()}
        </p>
      </header>
      {!loaded.ok && (
        <p role="alert" className="text-destructive">
          {m.settings_error_generic()}
        </p>
      )}
      {loaded.ok && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {m['collection.order_list_empty']()}
          </CardContent>
        </Card>
      )}
      {loaded.ok && rows.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m['collection.order_col_id']()}</TableHead>
                  <TableHead>{m['collection.order_col_product']()}</TableHead>
                  <TableHead>{m['collection.order_col_amount']()}</TableHead>
                  <TableHead>{m['collection.order_col_status']()}</TableHead>
                  <TableHead>{m['collection.order_col_created']()}</TableHead>
                  <TableHead aria-label={m['collection.order_col_actions']()} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.id}</TableCell>
                    <TableCell>
                      {productNameForProductId(order.productId) ?? order.productId}
                    </TableCell>
                    <TableCell>
                      {formatMoneyAmount(order.payableAmount, order.currency, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge>{m[collectionOrderStatusMessageKey(order.status)]()}</Badge>
                    </TableCell>
                    <TableCell>{new Date(order.createdAt).toLocaleDateString(locale)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <Link
                            to="/{-$locale}/dashboard/orders/$orderId"
                            params={{ locale, orderId: order.id }}
                          />
                        }
                      >
                        {m['collection.order_view_detail']()}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
