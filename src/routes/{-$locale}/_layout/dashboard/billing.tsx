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
import { toast } from '@/components/ui/toast'
import { websiteConfig } from '@/config/website'
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
 * 服务端数据经 `fetchBillingOverview`（server function）按当前会话取数，客户端不
 * 直接碰 `DB`。页面本身不重复鉴权——`dashboard` 的 `beforeLoad` 已经守卫了整棵
 * 子树；server function 内部另有一道会话检查（RPC 端点必须自己把关）。
 *
 * 「管理订阅」按钮调 `/api/payment` 的 DELETE，由服务端从数据库反查 customerId
 * （不接受客户端传入），因此这里不需要知道 Stripe 的 customer id。
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
      // 不回显服务端错误体：401 / 500 对用户是同一件事，「稍后重试」。
      setError(m.settings_error_generic())
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 结账结果的提示。`?checkout=` 是 Stripe 回跳时带上的，展示完就把它从地址栏
  // 抹掉（`replace`）：不抹的话刷新一次会再弹一次，用户看到的是早已处理过的旧消息。
  // 取消结账的回跳落在定价页，那边有同样的一段处理。
  useEffect(() => {
    if (checkout !== 'success') return
    toast.add({ type: 'success', title: m.settings_billing_checkout_success() })
    void router.navigate({
      to: '/{-$locale}/dashboard/billing',
      params: { locale: getRequestLocale() },
      replace: true,
    })
  }, [checkout, router])

  // Stripe Checkout 成功返回时补发 `purchase` 事件。
  //
  // 为什么不放在 webhook：webhook 跑在服务端（Workers），拿不到浏览器里的分析全局
  // 对象；而 `/api/payment` 的响应也走不到这里。URL 上的 `checkout=success` 是唯一
  // 能确认「这笔支付属于这个浏览器会话」的信号。
  //
  // 只发一次：`search` 在一次导航内不变，但 StrictMode 下 effect 跑两遍，用 ref
  // 挡掉第二次。
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
      // 新标签页打开：Stripe Billing Portal 里「返回商户」的按钮用的是同一 URL，
      // 若在本标签跳转，用户回到的账单页就是离开时的那个状态——刚才的加载与筛选
      // 都得重来。新标签页让原页面保持不动，关掉门户即可继续。
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

      {/* 当前订阅：一行一张卡，管理入口就放在卡内——订阅状态和「怎么改它」必须
          在同一个视线里，按钮放在区块外面会让用户看完卡片再去找按钮。 */}
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

      {/* 交易记录常驻而非折叠：它回答「我付过什么」，和当前订阅是同一趟浏览的两半，
          折起来反而要多一次点击才看得到自己的付款历史。

          表头必须留着。第一列是「这笔钱的性质」（订阅扣款 / 一次性购买）而不是方案
          名，第三列把「状态」和「金额」挤在一格，没有表头时这三列只能靠猜。 */}
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
 * 为什么是卡片而不是表格行：用户来账单页只关心一件事——「我现在是什么套餐、下次
 * 什么时候扣钱、怎么改」。这几个事实在卡片里一屏看完；表格行要横向读四列并对不上
 * 表头，订阅这种一页通常只有一条的数据用表格没有信息密度收益。
 *
 * 两点特意区别于普通表格展示：
 * - **状态**是一等元素：扣款失败（`past_due`）是这里唯一需要用户立刻行动的状态，
 *   用 `destructive` 而不是和其他状态共用一枚中性 Badge。
 * - **管理入口在卡内**：状态和「怎么改它」在同一个视线里，按钮不放区块外面。
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
  // 周期可能还没同步到（`checkout.session.completed` 与 `customer.subscription.created`
  // 之间），此时为 `null`。这时只显示金额，不拼一个用户看不懂的周期词。
  const intervalLabel = (() => {
    const key = subscriptionIntervalMessageKey(sub.interval)
    return key ? m[key]() : null
  })()
  const amount = formatAmount(sub.amount, sub.currency)
  // 取消续费后周期仍在走：这条要显式说出来，否则用户以为自己已经被降级了。
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
            {/* 周期未知时只说金额：`$5.99` 是确定的，「周期待同步」不是用户能用的信息。 */}
            {amount !== '—' && intervalLabel
              ? m.settings_billing_plan_price({ amount, interval: intervalLabel })
              : amount !== '—'
                ? amount
                : (intervalLabel ?? '')}
          </CardDescription>
        </div>
        {/* 只有能进 Stripe 门户的订阅才有管理入口：没有 customerId 的行（例如
            手工构造的测试数据）按钮会出现却打不开门户。 */}
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
 * Price 不在映射里时退回显示 Price id——它至少是真实数据，且能看出这是 Stripe 后台
 * 手工创建的那一笔。优先显示定价页上的方案名（「专业版」）由调用处
 * `planNameForSubscription` 完成，用户看得懂；取不到名时才走到这里。
 */
function planFallback(sub: SubscriptionRecord): string {
  return sub.priceId || sub.subscriptionId || sub.id
}

/**
 * 付款记录的类别文案。
 *
 * `payments.description` 由 webhook 写入，当前两条写入路径（一次性支付与
 * `invoice.paid`）都不填它，所以第一列实际只能靠 `type` 区分——这也是它该显示的
 * 内容：「这笔钱是订阅扣的还是买断的」。
 */
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
 * 续费日期用这个而不是 `formatDate`：同一天的续费时刻跨时区会差出十几小时，
 * 只给日期不足以支持「今天会不会被扣款」这种判断。
 */
function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

/**
 * 分 → 主单位格式化。
 *
 * `Intl.NumberFormat` 在服务端与客户端的 locale 行为一致，且不会把 `undefined`
 * 渲染成 `NaN`：金额或币种缺失时直接显示 `—`，不猜一个币种。
 */
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
