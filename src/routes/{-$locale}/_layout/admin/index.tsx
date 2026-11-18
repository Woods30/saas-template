import { IconChartBar, IconCoins, IconReceipt, IconRepeat } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDate } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adminRoutes } from '@/config/routes'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminBillingResult,
  fetchAdminBilling,
  productNameForProductId,
  subscriptionStatusMessageKey,
} from '@/modules/subscriptions/service'

/**
 * 管理台营收与订阅总览。
 *
 * 数据在路由 loader 里取（服务端），权限在 loader 的 server function 里再校验一次：
 * 只靠 `beforeLoad` 隐藏入口拦不住直接调用。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/')({
  loader: () => fetchAdminBilling(),
  // 页码放 URL：刷新与分享链接能停在原页，也符合「URL 即状态」的路由数据流。
  // 返回可选字段：首页不带 `?page=1`，菜单链接就不必逐处补 search。
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const parsed = Number(search.page)
    // 返回值**必须带键**（哪怕值是 `undefined`）。返回字面量 `{}` 时路由不会重写
    // URL，`?page=1` 这类默认值就会一直挂在地址栏上。
    return { page: Number.isInteger(parsed) && parsed > 1 ? parsed : undefined }
  },
  head: () => adminHead(adminRoutes.overview),
  component: AdminRevenuePage,
})

/** 金额以最小货币单位存储（分），展示前按币种小数位换算。 */
function money(amount: number, currency: string) {
  return formatMoney(amount, currency, getRequestLocale())
}

function AdminRevenuePage() {
  const data = Route.useLoaderData() as AdminBillingResult
  const locale = getRequestLocale()
  const { revenue, subscriptions, activeSubscriptionCount } = data
  const { page = 1 } = Route.useSearch()
  const navigate = Route.useNavigate()
  const totalPages = Math.max(1, Math.ceil(subscriptions.length / DEFAULT_PAGE_SIZE))
  // 页码可能因数据变少而越界（如删除了订阅），夹到有效范围而不是渲染空表。
  const currentPage = Math.min(page, totalPages)
  const pageItems = subscriptions.slice(
    (currentPage - 1) * DEFAULT_PAGE_SIZE,
    currentPage * DEFAULT_PAGE_SIZE,
  )
  const primaryBucket = revenue.buckets[0]
  const primaryCurrency = primaryBucket?.currency ?? 'usd'
  const totalPayments = revenue.buckets.reduce((sum, b) => sum + b.count, 0)

  const kpiCards = [
    {
      title: m.admin_revenue_net(),
      icon: IconChartBar,
      value: money(primaryBucket?.net ?? 0, primaryCurrency),
      hint: `${totalPayments} ${m.admin_revenue_payment_count()}`,
    },
    {
      title: m.admin_revenue_gross(),
      icon: IconReceipt,
      value: money(primaryBucket?.gross ?? 0, primaryCurrency),
      hint: primaryCurrency.toUpperCase(),
    },
    {
      title: m.admin_revenue_refunded(),
      icon: IconCoins,
      value: money(primaryBucket?.refunded ?? 0, primaryCurrency),
      hint: `${m.admin_revenue_failed_count()} ${revenue.failedCount}`,
    },
    {
      title: m.admin_revenue_active_subscriptions(),
      icon: IconRepeat,
      value: String(activeSubscriptionCount),
      hint: `${m.admin_revenue_subscriptions_title()} (${subscriptions.length})`,
    },
  ]

  const columns = useMemo<DataTableColumn<(typeof subscriptions)[number]>[]>(
    () => [
      {
        id: 'user',
        header: m.admin_revenue_col_user(),
        className: 'max-w-[220px] truncate',
        cell: (subscription) => subscription.email || subscription.userId,
      },
      {
        id: 'plan',
        header: m.admin_revenue_col_plan(),
        cell: (subscription) =>
          productNameForProductId(subscription.productId) ?? subscription.productId ?? '—',
      },
      {
        id: 'status',
        header: m.admin_revenue_col_status(),
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
        header: m.admin_revenue_col_amount(),
        cell: (subscription) =>
          subscription.amount != null && subscription.currency
            ? money(subscription.amount, subscription.currency)
            : '—',
      },
      {
        id: 'period',
        header: m.admin_revenue_col_period(),
        cell: (subscription) =>
          subscription.interval === 'month'
            ? m.settings_billing_interval_month()
            : subscription.interval === 'year'
              ? m.settings_billing_interval_year()
              : '—',
      },
      {
        id: 'startedAt',
        header: m.admin_revenue_col_started_at(),
        cell: (subscription) => <LocalDate value={subscription.createdAt} locale={locale} />,
      },
      {
        id: 'renewsAt',
        header: m.admin_revenue_col_renews_at(),
        cell: (subscription) => <LocalDate value={subscription.currentPeriodEnd} locale={locale} />,
      },
    ],
    [locale],
  )

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{card.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {revenue.buckets.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">{m.admin_revenue_empty()}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {revenue.buckets.map((bucket) => (
            <Card key={bucket.currency}>
              <CardHeader>
                <CardTitle className="uppercase">{bucket.currency}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label={m.admin_revenue_net()}
                  value={money(bucket.net, bucket.currency)}
                  emphasis
                />
                <Metric
                  label={m.admin_revenue_gross()}
                  value={money(bucket.gross, bucket.currency)}
                />
                <Metric
                  label={m.admin_revenue_refunded()}
                  value={money(bucket.refunded, bucket.currency)}
                />
                <Metric
                  label={m.admin_revenue_payment_count()}
                  value={String(bucket.count)}
                  hint={`${m.admin_revenue_failed_count()} ${revenue.failedCount}`}
                />
              </CardContent>
            </Card>
          ))}
          {revenue.buckets.length > 1 && (
            <p className="text-xs text-muted-foreground">{m.admin_revenue_multi_currency_note()}</p>
          )}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{m.admin_revenue_subscriptions_title()}</h3>
          <p className="text-sm text-muted-foreground">
            {m.admin_revenue_active_subscriptions()} {activeSubscriptionCount} /{' '}
            {subscriptions.length}
          </p>
        </div>

        <DataTable
          columns={columns}
          data={pageItems}
          rowKey={(subscription) => subscription.id}
          emptyTitle={m.admin_revenue_empty()}
          pagination={{
            page: currentPage,
            pageSize: DEFAULT_PAGE_SIZE,
            total: subscriptions.length,
            onPageChange: (next) =>
              void navigate({ search: { page: next > 1 ? next : undefined } }),
          }}
        />
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={emphasis ? 'mt-1 text-2xl font-semibold' : 'mt-1 text-xl font-medium'}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
