import { IconReceipt } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDate } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { adminRoutes } from '@/config/routes'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
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
  // 属性声明为可选：`MakeRequiredSearchParams` 会把「必填的 search 参数」算进
  // 链接类型，导致侧栏里的 linkOptions 必须带 search，导航项就没法只写路径。
  validateSearch: (search: Record<string, unknown>): AdminOrdersSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
    const raw = search.status
    const status =
      typeof raw === 'string' &&
      raw !== 'all' &&
      ORDER_STATUSES.includes(raw as AdminOrderStatusFilter)
        ? (raw as AdminOrderStatusFilter)
        : undefined
    return { page, status }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, status: search.status ?? 'all' }),
  loader: ({ deps }) =>
    fetchAdminOrders({
      data: {
        status: deps.status,
        limit: DEFAULT_PAGE_SIZE,
        offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.orders),
  component: AdminOrdersPage,
})

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

  // 列定义随语言变化；`m.*()` 在渲染期求值，因此依赖里带上 locale。
  const columns = useMemo<DataTableColumn<AdminOrder>[]>(
    () => [
      {
        id: 'user',
        header: m.admin_orders_col_user(),
        className: 'max-w-[220px] truncate',
        cell: (order) => order.email || order.userId || '—',
      },
      {
        id: 'product',
        header: m.admin_orders_col_product(),
        cell: (order) => productNameForProductId(order.productId) ?? order.productId ?? '—',
      },
      {
        id: 'amount',
        header: m.admin_orders_col_amount(),
        cell: (order) => formatMoney(order.amount, order.currency, locale),
      },
      {
        id: 'refunded',
        header: m.admin_orders_col_refunded(),
        cell: (order) =>
          order.refundedAmount > 0
            ? formatMoney(order.refundedAmount, order.currency, locale)
            : '—',
      },
      {
        id: 'status',
        header: m.admin_orders_col_status(),
        cell: (order) => (
          <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
            {m[paymentStatusMessageKey(order.status)]()}
          </Badge>
        ),
      },
      {
        id: 'paidAt',
        header: m.admin_orders_col_paid_at(),
        className: 'hidden lg:table-cell',
        cell: (order) => <LocalDate value={order.paidAt} locale={locale} />,
      },
      {
        id: 'createdAt',
        header: m.admin_orders_col_created_at(),
        className: 'hidden xl:table-cell',
        cell: (order) => <LocalDate value={order.createdAt} locale={locale} />,
      },
    ],
    [locale],
  )

  return (
    <DataTable
      columns={columns}
      data={data.orders}
      rowKey={(order) => order.id}
      emptyIcon={<IconReceipt aria-hidden />}
      emptyTitle={m.admin_orders_empty()}
      pagination={{
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        total: data.total,
        onPageChange: (next) =>
          void navigate({
            search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }),
          }),
      }}
      toolbar={
        <Select
          value={status}
          onValueChange={(value) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                status: value === 'all' ? undefined : (value as AdminOrderStatusFilter),
                page: undefined,
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
      }
    />
  )
}
