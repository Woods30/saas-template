import { IconAlertTriangle, IconCreditCard } from '@tabler/icons-react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { websiteConfig } from '@/config/website'
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'
import { trackPurchase } from '@/lib/analytics/events'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import {
  fetchBillingOverview,
  type PaymentRecord,
  type SubscriptionRecord,
} from '@/payment/billing'
import {
  paymentStatusMessageKey,
  planNameForSubscription,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'

/**
 * 账单与订阅页。
 *
 * 数据经 `fetchBillingOverview` 按会话取数，客户端不直接碰 `DB`。
 * 「管理订阅」的 customerId 由服务端反查，不接受客户端传入。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/billing')({
  // 与侧栏入口同源：支付模块关闭时整页 404。
  beforeLoad: () => assertPageEnabled('payment'),
  head: () =>
    seo('/dashboard/billing', {
      title: m.settings_billing_title(),
      description: m.settings_billing_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: BillingPage,
  validateSearch: (search: Record<string, unknown>): { checkout?: 'success' | 'cancelled' } => {
    const value = search.checkout
    if (value === 'success' || value === 'cancelled') return { checkout: value }
    return {}
  },
})

function BillingPage() {
  const router = useRouter()
  const { checkout } = Route.useSearch()
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[] | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await fetchBillingOverview({ data: {} })
      setSubscriptions(result.subscriptions)
      setPayments(result.payments)
    } catch {
      // 不回显服务端错误体：401 / 500 对用户是同一件事。
      setError(m.settings_error_generic())
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 展示完用 `replace` 抹掉 `?checkout=`，否则刷新会再弹一次旧消息。
  useCheckoutNotice({
    checkout,
    type: 'success',
    title: m.settings_billing_checkout_success(),
    clearUrl: () => {
      void router.navigate({
        to: '/{-$locale}/dashboard/billing',
        params: { locale: getRequestLocale() },
        replace: true,
      })
    },
  })

  // `purchase` 事件必须在浏览器补发：webhook 跑在 Workers，拿不到分析全局对象，
  // `checkout=success` 是唯一能确认归属本会话的信号。
  // 用 ref 挡掉 StrictMode 下的第二次执行。
  const trackedRef = useRef(false)
  useEffect(() => {
    if (checkout !== 'success' || trackedRef.current) return
    trackedRef.current = true
    const latest = payments?.find((p) => p.status === 'paid')
    trackPurchase({
      planId: subscriptions?.find((s) => s.status === 'active')?.priceId ?? '',
      value: latest?.amount ?? 0,
      currency: latest?.currency ?? 'usd',
    })
  }, [checkout, payments, subscriptions])

  async function onManageSubscription(customerId: string | null | undefined) {
    if (!customerId) return
    setManaging(true)
    try {
      const response = await fetch('/api/payment', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      })
      if (!response.ok) {
        setError(m.settings_error_generic())
        return
      }
      const body = (await response.json()) as { url?: string }
      if (!body.url) {
        setError(m.settings_error_generic())
        return
      }
      // 新标签页打开：门户的「返回商户」用的是同一 URL，本标签跳转会让页面状态丢失。
      window.open(body.url, '_blank', 'noopener')
    } catch {
      setError(m.settings_error_generic())
    } finally {
      setManaging(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{m.settings_billing_title()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_billing_description()}</p>
      </header>

      <Link
        to="/{-$locale}/pricing"
        params={{ locale: getRequestLocale() }}
        className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
      >
        {m.settings_billing_view_plans()}
      </Link>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* 当前订阅：管理入口放在卡内，状态与「怎么改它」保持同一视线。 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {m.settings_billing_current_plan()}
        </h2>
        {subscriptions === null ? (
          <Spinner className="size-5" />
        ) : subscriptions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <IconCreditCard className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{m.settings_billing_empty()}</EmptyTitle>
              <EmptyDescription>{m.settings_billing_empty_hint()}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                size="sm"
                render={<Link to="/{-$locale}/pricing" params={{ locale: getRequestLocale() }} />}
              >
                {m.settings_billing_upgrade_cta()}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                managing={managing}
                onManage={() => onManageSubscription(sub.customerId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 交易记录常驻不折叠。表头必须留着：第一列是款项性质而非方案名，
          第三列把状态与金额挤在一格，没有表头只能靠猜。 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {m.settings_billing_transactions()}
        </h2>
        {payments === null ? (
          <Spinner className="size-5" />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.settings_billing_pay_none()}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.settings_billing_plan()}</TableHead>
                <TableHead>{m.settings_billing_date()}</TableHead>
                <TableHead className="text-right">{m.settings_billing_amount()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="max-w-40 truncate">
                    {payment.description ?? paymentTypeKey(payment.type)()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(payment.paidAt ?? payment.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        paymentStatusMessageKey(payment.status) === 'settings_billing_paid'
                          ? 'secondary'
                          : 'outline'
                      }
                      className="mr-3"
                    >
                      {m[paymentStatusMessageKey(payment.status)]()}
                    </Badge>
                    <span className="tabular-nums">
                      {formatAmount(payment.amount, payment.currency)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

/**
 * 单条订阅的摘要卡。
 *
 * 一页通常只有一条订阅，卡片比表格更能一屏读完「套餐、下次扣款、怎么改」。
 * `past_due` 是唯一需要用户立刻行动的状态，故单独用 `destructive`。
 */
function SubscriptionCard({
  sub,
  managing,
  onManage,
}: {
  sub: SubscriptionRecord
  managing: boolean
  onManage: () => void
}) {
  const plan = planNameForSubscription(sub.priceId, websiteConfig.payment.priceMap)
  const statusKey = subscriptionStatusMessageKey(sub.status)
  // 周期可能尚未同步（两个 webhook 之间），此时只显示金额。
  const intervalLabel = (() => {
    const key = subscriptionIntervalMessageKey(sub.interval)
    return key ? m[key]() : null
  })()
  const amount = formatAmount(sub.amount, sub.currency)
  // 取消续费后周期仍在走，须显式说明，否则用户以为自己已被降级。
  const cancellingAtPeriodEnd =
    sub.cancelAtPeriodEnd && (sub.status === 'active' || sub.status === 'trialing')

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{plan ?? planFallback(sub)}</CardTitle>
            <Badge variant={statusKey === 'settings_billing_past_due' ? 'destructive' : 'outline'}>
              {cancellingAtPeriodEnd ? m.settings_billing_status_cancel_soon() : m[statusKey]()}
            </Badge>
          </div>
          <CardDescription>
            {/* 周期未知时只说金额。 */}
            {amount !== '—' && intervalLabel
              ? m.settings_billing_plan_price({ amount, interval: intervalLabel })
              : amount !== '—'
                ? amount
                : (intervalLabel ?? '')}
          </CardDescription>
        </div>
        {/* 没有 customerId 的订阅进不了门户，不渲染管理按钮。 */}
        {sub.customerId && (
          <Button variant="outline" size="sm" disabled={managing} onClick={onManage}>
            {managing ? <Spinner className="size-4" /> : null}
            {m.settings_billing_manage()}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {sub.currentPeriodEnd && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">{m.settings_billing_renews_on_short()}</span>
            <span className="font-medium tabular-nums">{formatDateTime(sub.currentPeriodEnd)}</span>
          </div>
        )}
        {cancellingAtPeriodEnd && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{m.settings_billing_cancel_hint()}</span>
          </div>
        )}
        {statusKey === 'settings_billing_past_due' && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{m.settings_billing_past_due()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 订阅卡的套餐名兜底。
 *
 * Price 不在映射里时退回显示 Price id：至少是真实数据，能看出是后台手工创建的。
 */
function planFallback(sub: SubscriptionRecord): string {
  return sub.priceId || sub.subscriptionId || sub.id
}

/** 付款记录的类别文案。webhook 不写 `description`，第一列只能靠 `type` 区分。 */
function paymentTypeKey(type: string) {
  switch (type) {
    case 'subscription':
      return m.settings_billing_pay_type_subscription
    case 'one_time':
      return m.settings_billing_pay_type_one_time
    default:
      return m.settings_billing_pay_type_invoice
  }
}

/** `Date | string | null` → 本地日期；空值显示 `—`。 */
function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

/**
 * `Date | string | null` → 本地日期 + 时间。
 *
 * 续费日期需要精确到时刻：跨时区可能差十几小时，只给日期无法判断「今天是否扣款」。
 */
function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

/** 分 → 主单位格式化；金额或币种缺失时显示 `—`，不猜币种。 */
function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !currency) return '—'
  try {
    return (amount / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    })
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}
