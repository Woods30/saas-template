import { IconRepeat } from '@tabler/icons-react'
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
import { adminRoutes } from '@/config/routes'
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
    const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
    const raw = search.status
    const status =
      typeof raw === 'string' &&
      SUBSCRIPTION_STATUSES.includes(raw as AdminSubscriptionStatusFilter)
        ? (raw as AdminSubscriptionStatusFilter)
        : 'all'
    return { page, status }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, status: search.status ?? 'all' }),
  loader: ({ deps }) =>
    fetchAdminSubscriptions({
      data: {
        status: deps.status,
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.subscriptions),
  component: AdminSubscriptionsPage,
})

/** 每页订阅条数。 */
const PAGE_SIZE = 20

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
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                status: value as AdminSubscriptionStatusFilter,
                page: 1,
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
      </div>

      {data.subscriptions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconRepeat aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{m.admin_subscriptions_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.admin_subscriptions_col_user()}</TableHead>
              <TableHead>{m.admin_subscriptions_col_plan()}</TableHead>
              <TableHead>{m.admin_subscriptions_col_status()}</TableHead>
              <TableHead>{m.admin_subscriptions_col_amount()}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {m.admin_subscriptions_col_interval()}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {m.admin_subscriptions_col_renews_at()}
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                {m.admin_subscriptions_col_created_at()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subscriptions.map((subscription: AdminSubscriptionItem) => (
              <TableRow key={subscription.id}>
                <TableCell className="max-w-[220px] truncate">
                  {subscription.email || subscription.userId || '—'}
                </TableCell>
                <TableCell>
                  {productNameForProductId(subscription.productId) ?? subscription.productId ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                      {m[subscriptionStatusMessageKey(subscription.status)]()}
                    </Badge>
                    {subscription.cancelAtPeriodEnd && (
                      <Badge variant="outline">{m.admin_revenue_cancel_at_period_end()}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {subscription.amount !== null && subscription.currency
                    ? formatMoney(subscription.amount, subscription.currency, locale)
                    : '—'}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {subscription.interval === 'month'
                    ? m.settings_billing_interval_month()
                    : subscription.interval === 'year'
                      ? m.settings_billing_interval_year()
                      : '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LocalDate value={subscription.currentPeriodEnd} locale={locale} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <LocalDate value={subscription.createdAt} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data.total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {m.admin_subscriptions_page_status({ page: currentPage, total: totalPages })}
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
              {m.admin_subscriptions_page_prev()}
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
              {m.admin_subscriptions_page_next()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
