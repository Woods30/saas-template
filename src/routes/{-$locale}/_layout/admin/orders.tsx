import { IconReceipt } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { LocalDate } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminOrder,
  type AdminOrderStatusFilter,
  fetchAdminOrders,
  paymentStatusMessageKey,
  productNameForProductId,
} from '@/modules/subscriptions/service'

/**
 * 管理台订单列表。
 *
 * 与营收页的分工：营收页给聚合口径（每个币种收了多少），这里给明细口径
 * （哪一笔付过款、付了多少、退了多少）。
 *
 * 页码与状态筛选放 URL：刷新与分享链接能停在原页，也符合「URL 即状态」的路由数据流。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/orders')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  // 属性声明为可选：`MakeRequiredSearchParams` 会把「必填的 search 参数」算进
  // 链接类型，导致侧栏里的 linkOptions 必须带 search，导航项就没法只写路径。
  validateSearch: (search: Record<string, unknown>): AdminOrdersSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
    const raw = search.status
    const status =
      typeof raw === 'string' && ORDER_STATUSES.includes(raw as AdminOrderStatusFilter)
        ? (raw as AdminOrderStatusFilter)
        : 'all'
    return { page, status }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, status: search.status ?? 'all' }),
  loader: ({ deps }) =>
    fetchAdminOrders({
      data: {
        status: deps.status,
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      },
    }),
  head: () =>
    seo('/admin/orders', {
      title: m.admin_orders_title(),
      description: m.admin_orders_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminOrdersPage,
})

/** 每页订单条数。 */
const PAGE_SIZE = 20

/** 可选的状态筛选值。 */
const ORDER_STATUSES: AdminOrderStatusFilter[] = [
  'all',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]

interface AdminOrdersSearch {
  page?: number
  status?: AdminOrderStatusFilter
}

/** 筛选下拉的选项：必须渲染期构造，否则切换语言后选项仍是旧文案。 */
function statusItems() {
  return [
    { value: 'all', label: m.admin_orders_filter_all() },
    { value: 'paid', label: m.admin_orders_filter_paid() },
    { value: 'failed', label: m.admin_orders_filter_failed() },
    { value: 'refunded', label: m.admin_orders_filter_refunded() },
    { value: 'partially_refunded', label: m.admin_orders_filter_partially_refunded() },
  ]
}

function AdminOrdersPage() {
  const data = Route.useLoaderData()
  const { page = 1, status = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  // 页码可能因数据变少而越界（如订单被删），夹到有效范围而不是渲染空表。
  const currentPage = Math.min(page, totalPages)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{m.admin_orders_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.admin_orders_description()}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                status: value as AdminOrderStatusFilter,
                page: 1,
              }),
            })
          }
          items={statusItems()}
        >
          <SelectTrigger size="sm" aria-label={m.admin_orders_col_status()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {statusItems().find((item) => item.value === value)?.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconReceipt aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{m.admin_orders_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        // 不套 `Card`：卡片自带 ring 边框，与 `Table` 自身的分隔线叠成双层外框。
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.admin_orders_col_user()}</TableHead>
              <TableHead>{m.admin_orders_col_product()}</TableHead>
              <TableHead>{m.admin_orders_col_amount()}</TableHead>
              <TableHead>{m.admin_orders_col_refunded()}</TableHead>
              <TableHead>{m.admin_orders_col_status()}</TableHead>
              <TableHead className="hidden lg:table-cell">{m.admin_orders_col_paid_at()}</TableHead>
              <TableHead className="hidden xl:table-cell">
                {m.admin_orders_col_created_at()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.map((order: AdminOrder) => (
              <TableRow key={order.id}>
                <TableCell className="max-w-[220px] truncate">
                  {order.email || order.userId || '—'}
                </TableCell>
                <TableCell>
                  {productNameForProductId(order.productId) ?? order.productId ?? '—'}
                </TableCell>
                <TableCell>{formatMoney(order.amount, order.currency, locale)}</TableCell>
                <TableCell>
                  {order.refundedAmount > 0
                    ? formatMoney(order.refundedAmount, order.currency, locale)
                    : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                    {m[paymentStatusMessageKey(order.status)]()}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LocalDate value={order.paidAt} locale={locale} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <LocalDate value={order.createdAt} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data.total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {m.admin_orders_page_status({ page: currentPage, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: currentPage - 1 }),
                })
              }
            >
              {m.admin_orders_page_prev()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: currentPage + 1 }),
                })
              }
            >
              {m.admin_orders_page_next()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
