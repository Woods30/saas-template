import { IconCreditCard } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
  head: () => {
    const base = seo('/dashboard/billing', {
      title: m.settings_billing_title(),
      description: m.settings_billing_description(),
      locale: getRequestLocale(),
    })
    return { ...base, meta: [...base.meta, { name: 'robots', content: 'noindex' }] }
  },
  component: BillingPage,
  validateSearch: (search: Record<string, unknown>): { checkout?: 'success' | 'cancelled' } => {
    const value = search.checkout
    if (value === 'success' || value === 'cancelled') return { checkout: value }
    return {}
  },
})

function BillingPage() {
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

  // 「生效中」的订阅才值得给管理入口：已取消的行点进去也只是看历史。
  const activeSubscription = subscriptions?.find((sub) => sub.status === 'active')

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{m.settings_billing_title()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_billing_description()}</p>
      </header>

      {/* Stripe Checkout 的返回提示：带 query 参数回来时说明一笔支付刚结束。 */}
      {checkout === 'success' && (
        <p role="status" className="text-sm text-success">
          {m.settings_billing_checkout_success()}
        </p>
      )}
      {checkout === 'cancelled' && (
        <p role="status" className="text-sm text-muted-foreground">
          {m.settings_billing_checkout_cancelled()}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{m.settings_billing_status()}</h2>
        {subscriptions === null ? (
          <Spinner className="size-5" />
        ) : subscriptions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <IconCreditCard className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{m.settings_billing_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div data-slot="table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.settings_billing_plan()}</TableHead>
                  <TableHead>{m.settings_billing_status()}</TableHead>
                  <TableHead>{m.settings_billing_renews_on()}</TableHead>
                  <TableHead>{m.settings_billing_amount()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <PlanName sub={sub} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {m[subscriptionStatusMessageKey(sub.status)]()}
                      </Badge>
                    </TableCell>
                    {/* 具体时间而非只有日期：续费多发生在本地时区的白天，
                        只写「2026/10/24」看不出是当天什么时候。 */}
                    <TableCell>{formatDateTime(sub.currentPeriodEnd)}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        {formatAmount(sub.amount, sub.currency)}
                        <Badge variant="outline">
                          {m[subscriptionIntervalMessageKey(sub.interval)]()}
                        </Badge>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="outline"
            disabled={!activeSubscription?.customerId || managing}
            onClick={() => onManageSubscription(activeSubscription?.customerId)}
          >
            {managing ? <Spinner className="size-4" /> : null}
            {m.settings_billing_manage()}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{m.settings_billing_date()}</h2>
        {payments === null ? (
          <Spinner className="size-5" />
        ) : payments.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m.settings_billing_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div data-slot="table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.settings_billing_table_date()}</TableHead>
                  <TableHead>{m.settings_billing_table_amount()}</TableHead>
                  <TableHead>{m.settings_billing_table_status()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                    <TableCell>{formatAmount(payment.amount, payment.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.status === 'refunded'
                          ? m.settings_billing_cancelled()
                          : m.settings_billing_active()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 订阅行的套餐名。
 *
 * 优先显示定价页上的方案名（「专业版」），用户看得懂；Price 不在映射里时退回显示
 * Price id——它至少是真实数据，且能看出这是 Stripe 后台手工创建的那一笔。
 *
 * 独立成组件而不是一行三元：读的是 `websiteConfig.payment.priceMap`（模块级常量），
 * 放在渲染函数里每次遍历都会重算，而组件只在 props 变化时重渲染。
 */
function PlanName({ sub }: { sub: SubscriptionRecord }) {
  const plan = planNameForSubscription(sub.priceId, websiteConfig.payment.priceMap)
  if (plan) return <>{plan}</>
  return <span className="font-mono text-xs">{sub.priceId || sub.subscriptionId || sub.id}</span>
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
