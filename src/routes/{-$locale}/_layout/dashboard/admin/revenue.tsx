import { createFileRoute } from '@tanstack/react-router'
import { type AdminBillingResult, fetchAdminBilling } from '@/auth/admin-billing'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { paymentStatusMessageKey, productNameForProductId } from '@/payment/billing-query'

/**
 * 管理台营收与订阅总览。
 *
 * 数据在路由 loader 里取（服务端），权限在 loader 的 server function 里再校验一次：
 * 只靠 `beforeLoad` 隐藏入口拦不住直接调用。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/revenue')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  loader: () => fetchAdminBilling(),
  head: () =>
    seo('/dashboard/admin/revenue', {
      title: m.admin_revenue_title(),
      description: m.admin_revenue_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminRevenuePage,
})

/** 金额以最小货币单位存储（分），展示前按币种小数位换算。 */
function money(amount: number, currency: string) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits
  return new Intl.NumberFormat(getRequestLocale(), { style: 'currency', currency }).format(
    amount / 10 ** (digits ?? 2),
  )
}

function date(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString(getRequestLocale()) : '—'
}

function AdminRevenuePage() {
  const data = Route.useLoaderData() as AdminBillingResult
  const { revenue, subscriptions, activeSubscriptionCount } = data

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{m.admin_revenue_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.admin_revenue_description()}</p>
      </header>

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

        {subscriptions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m.admin_revenue_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.admin_revenue_col_user()}</TableHead>
                    <TableHead>{m.admin_revenue_col_plan()}</TableHead>
                    <TableHead>{m.admin_revenue_col_status()}</TableHead>
                    <TableHead>{m.admin_revenue_col_amount()}</TableHead>
                    <TableHead>{m.admin_revenue_col_period()}</TableHead>
                    <TableHead>{m.admin_revenue_col_renews_at()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell className="max-w-[220px] truncate">
                        {subscription.email || subscription.userId}
                      </TableCell>
                      <TableCell>
                        {productNameForProductId(subscription.productId) ??
                          subscription.productId ??
                          '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            variant={subscription.status === 'active' ? 'default' : 'secondary'}
                          >
                            {m[paymentStatusMessageKey(subscription.status)]()}
                          </Badge>
                          {subscription.cancelAtPeriodEnd && (
                            <Badge variant="outline">
                              {m.admin_revenue_cancel_at_period_end()}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {subscription.amount != null && subscription.currency
                          ? money(subscription.amount, subscription.currency)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {subscription.interval === 'month'
                          ? m.settings_billing_interval_month()
                          : subscription.interval === 'year'
                            ? m.settings_billing_interval_year()
                            : '—'}
                      </TableCell>
                      <TableCell>{date(subscription.currentPeriodEnd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
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
