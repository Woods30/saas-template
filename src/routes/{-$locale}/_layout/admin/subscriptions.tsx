import { IconRepeat } from '@tabler/icons-react'
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
  type AdminSubscriptionItem,
  type AdminSubscriptionStatusFilter,
  fetchAdminSubscriptions,
  productNameForProductId,
  subscriptionStatusMessageKey,
} from '@/modules/subscriptions/service'

/**
 * 管理台订阅列表。
 *
 * 关注的是**续费**：什么时候到期、要不要取消、还剩多久。
 * 订单页看的是已经收过钱的事实，两边口径不同所以分成两页。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/subscriptions')({
  // 属性声明为可选：`MakeRequiredSearchParams` 会把「必填的 search 参数」算进
  // 链接类型，导致侧栏里的 linkOptions 必须带 search，导航项就没法只写路径。
  validateSearch: (search: Record<string, unknown>): AdminSubscriptionsSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
    const raw = search.status
    const status =
      typeof raw === 'string' &&
      raw !== 'all' &&
      SUBSCRIPTION_STATUSES.includes(raw as AdminSubscriptionStatusFilter)
        ? (raw as AdminSubscriptionStatusFilter)
        : undefined
    return { page, status }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, status: search.status ?? 'all' }),
  loader: ({ deps }) =>
    fetchAdminSubscriptions({
      data: {
        status: deps.status,
        limit: DEFAULT_PAGE_SIZE,
        offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.subscriptions),
  component: AdminSubscriptionsPage,
})

/** 可选的状态筛选值。 */
const SUBSCRIPTION_STATUSES: AdminSubscriptionStatusFilter[] = [
  'all',
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
]

interface AdminSubscriptionsSearch {
  page?: number
  status?: AdminSubscriptionStatusFilter
}

/** 筛选下拉的选项：渲染期构造，切换语言后选项才跟着更新。 */
function statusItems() {
  return [
    { value: 'all', label: m.admin_subscriptions_filter_all() },
    { value: 'active', label: m.admin_subscriptions_filter_active() },
    { value: 'trialing', label: m.admin_subscriptions_filter_trialing() },
    { value: 'past_due', label: m.admin_subscriptions_filter_past_due() },
    { value: 'canceled', label: m.admin_subscriptions_filter_canceled() },
    { value: 'incomplete', label: m.admin_subscriptions_filter_incomplete() },
  ]
}

function AdminSubscriptionsPage() {
  const data = Route.useLoaderData()
  const { page = 1, status = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  // 列定义随语言变化；`m.*()` 在渲染期求值，因此依赖里带上 locale。
  const columns = useMemo<DataTableColumn<AdminSubscriptionItem>[]>(
    () => [
      {
        id: 'user',
        header: m.admin_subscriptions_col_user(),
        className: 'max-w-[220px] truncate',
        cell: (subscription) => subscription.email || subscription.userId || '—',
      },
      {
        id: 'plan',
        header: m.admin_subscriptions_col_plan(),
        cell: (subscription) =>
          productNameForProductId(subscription.productId) ?? subscription.productId ?? '—',
      },
      {
        id: 'status',
        header: m.admin_subscriptions_col_status(),
        cell: (subscription) => (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
              {m[subscriptionStatusMessageKey(subscription.status)]()}
            </Badge>
            {subscription.cancelAtPeriodEnd && (
              <Badge variant="outline">{m.admin_revenue_cancel_at_period_end()}</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'amount',
        header: m.admin_subscriptions_col_amount(),
        cell: (subscription) =>
          subscription.amount !== null && subscription.currency
            ? formatMoney(subscription.amount, subscription.currency, locale)
            : '—',
      },
      {
        id: 'interval',
        header: m.admin_subscriptions_col_interval(),
        className: 'hidden sm:table-cell',
        cell: (subscription) =>
          subscription.interval === 'month'
            ? m.settings_billing_interval_month()
            : subscription.interval === 'year'
              ? m.settings_billing_interval_year()
              : '—',
      },
      {
        id: 'renewsAt',
        header: m.admin_subscriptions_col_renews_at(),
        className: 'hidden lg:table-cell',
        cell: (subscription) => <LocalDate value={subscription.currentPeriodEnd} locale={locale} />,
      },
      {
        id: 'createdAt',
        header: m.admin_subscriptions_col_created_at(),
        className: 'hidden xl:table-cell',
        cell: (subscription) => <LocalDate value={subscription.createdAt} locale={locale} />,
      },
    ],
    [locale],
  )

  return (
    <DataTable
      columns={columns}
      data={data.subscriptions}
      rowKey={(subscription) => subscription.id}
      emptyIcon={<IconRepeat aria-hidden />}
      emptyTitle={m.admin_subscriptions_empty()}
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
                status: value === 'all' ? undefined : (value as AdminSubscriptionStatusFilter),
                page: undefined,
              }),
            })
          }
          items={statusItems()}
        >
          <SelectTrigger size="sm" aria-label={m.admin_subscriptions_col_status()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBSCRIPTION_STATUSES.map((value) => (
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
