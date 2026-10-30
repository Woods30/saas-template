import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { type BillingOverview, fetchBillingOverview } from '@/payment/billing'
import {
  paymentStatusMessageKey,
  productNameForProductId,
  splitBillingDisplay,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/billing')({
  beforeLoad: () => assertPageEnabled('payment'),
  // 数据在路由加载阶段取好：客户端导航时内容随路由一起出现，不会先渲染空壳再补数据。
  loader: async () => {
    try {
      return { ok: true as const, data: await fetchBillingOverview({ data: { limit: 50 } }) }
    } catch {
      // 失败交给页面渲染提示，不用抛错打断整棵路由。
      return { ok: false as const, data: null }
    }
  },
  head: () =>
    seo('/dashboard/billing', {
      title: m.settings_billing_title(),
      description: m.settings_billing_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  validateSearch: (search: Record<string, unknown>): { checkout?: 'success' | 'cancelled' } =>
    search.checkout === 'success' || search.checkout === 'cancelled'
      ? { checkout: search.checkout }
      : {},
  component: BillingPage,
})

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

function BillingPage() {
  const router = useRouter()
  const { checkout } = Route.useSearch()
  const locale = getRequestLocale()
  const loaded = Route.useLoaderData()
  const [data] = useState<BillingOverview | null>(loaded.data)
  const [error, setError] = useState(!loaded.ok)
  const [managing, setManaging] = useState(false)
  useCheckoutNotice({
    checkout,
    type: checkout === 'success' ? 'success' : 'info',
    title:
      checkout === 'success'
        ? m.settings_billing_checkout_success()
        : m.settings_billing_checkout_cancelled(),
    clearUrl: () => {
      void router.navigate({
        to: '/{-$locale}/dashboard/billing',
        params: { locale },
        replace: true,
      })
    },
  })
  const display = splitBillingDisplay({
    subscriptions: data?.subscriptions ?? [],
    payments: data?.payments ?? [],
  })
  const current = display.currentSubscription

  async function manage() {
    setManaging(true)
    try {
      const response = await fetch('/api/payment', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      })
      if (!response.ok) throw new Error('Portal unavailable')
      const body = (await response.json()) as { url: string }
      window.location.assign(body.url)
    } catch {
      setError(true)
      setManaging(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{m.settings_billing_title()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_billing_description()}</p>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {m.settings_error_generic()}
        </p>
      )}
      {!data && !error && <p>{m.payment_loading()}</p>}
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{m.settings_billing_my_plans()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {current ? (
                <>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold">
                      {productNameForProductId(current.productId) ?? current.priceId}
                    </h2>
                    <Badge>{m[subscriptionStatusMessageKey(current.status)]()}</Badge>
                  </div>
                  {current.amount != null && current.currency && (
                    <p>
                      {money(current.amount, current.currency)}
                      {current.interval
                        ? ` / ${current.intervalCount && current.intervalCount > 1 ? current.intervalCount : ''} ${current.interval}`
                        : ''}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {current.cancelAtPeriodEnd
                      ? m.settings_billing_ended_on()
                      : m.settings_billing_renews_on()}{' '}
                    {date(current.currentPeriodEnd)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">{m.settings_billing_empty()}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button render={<Link to="/{-$locale}" params={{ locale }} hash="pricing" />}>
                  {m.settings_billing_view_plans()}
                </Button>
                {data.canManage && (
                  <Button variant="outline" disabled={managing} onClick={() => void manage()}>
                    {m.settings_billing_manage()}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          {display.historySubscriptions.length > 0 && (
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {m.settings_billing_history_title()}
              </summary>
              <ul className="mt-3 space-y-2">
                {display.historySubscriptions.map((sub) => (
                  <li key={sub.id} className="flex justify-between gap-4 text-sm">
                    <span>{productNameForProductId(sub.productId) ?? sub.priceId}</span>
                    <span>
                      {m[subscriptionStatusMessageKey(sub.status)]()} · {date(sub.currentPeriodEnd)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{m.settings_billing_pay_history()}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.payments.length === 0 ? (
                <p className="text-muted-foreground">{m.settings_billing_pay_none()}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.settings_billing_date()}</TableHead>
                      <TableHead>{m.settings_billing_plan()}</TableHead>
                      <TableHead>{m.settings_billing_amount()}</TableHead>
                      <TableHead>{m.settings_billing_status()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{date(payment.paidAt ?? payment.createdAt)}</TableCell>
                        <TableCell>
                          {productNameForProductId(payment.productId) ?? payment.description ?? '—'}
                        </TableCell>
                        <TableCell>
                          {money(payment.amount, payment.currency)}
                          {Boolean(payment.refundedAmount) && (
                            <span className="block text-xs text-muted-foreground">
                              {m.settings_billing_refunded()}:{' '}
                              {money(payment.refundedAmount ?? 0, payment.currency)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{m[paymentStatusMessageKey(payment.status)]()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
