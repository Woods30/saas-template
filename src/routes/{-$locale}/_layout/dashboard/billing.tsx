import { IconAlertTriangle, IconChevronRight, IconClock, IconCreditCard } from '@tabler/icons-react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'
import { trackPurchase } from '@/lib/analytics/events'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import {
  type CurrentPlan,
  fetchBillingOverview,
  type PaymentRecord,
  type SubscriptionRecord,
  type SwitchTarget,
} from '@/payment/billing'
import {
  paymentStatusMessageKey,
  productNameForProductId,
  splitBillingDisplay,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'
import { startSwitch } from '@/payment/switch-client'

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
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null)
  const [switchTargets, setSwitchTargets] = useState<SwitchTarget[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  /** 正在切换的目标（`产品-周期`）；同时只有一个请求在飞。 */
  const [switching, setSwitching] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await fetchBillingOverview({ data: {} })
      setSubscriptions(result.subscriptions)
      setPayments(result.payments)
      setCurrentPlan(result.currentPlan)
      setSwitchTargets(result.switchTargets)
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
      productId:
        subscriptions?.find((s) => s.isCurrent)?.productId ??
        payments?.find((p) => p.isCurrent)?.productId ??
        '',
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

  /**
   * 切换方案。
   *
   * 切换的是**现有那份订阅的价格**，不新开订阅：两份订阅就是两份扣款。降级**期末
   * 生效**——服务端会把「待生效」的方案另记一份，账单页据此显示「已安排变更」。
   */
  async function onSwitch(productId: string, interval: 'month' | 'year' | 'one_time') {
    const key = `${productId}-${interval}`
    setSwitching(key)
    try {
      const outcome = await startSwitch({ productId, interval })
      switch (outcome.kind) {
        case 'switched':
          toast.add({
            type: 'success',
            title: m.settings_billing_switch_success(),
            description: m.settings_billing_switch_switched_desc({
              name: productNameForProductId(productId) ?? productId,
            }),
          })
          break
        case 'scheduled':
          toast.add({
            type: 'success',
            title: m.settings_billing_switch_scheduled({
              date: formatDateTime(outcome.effectiveAt),
            }),
          })
          break
        case 'unchanged':
          toast.add({
            type: 'info',
            title: outcome.pendingCancelled
              ? m.settings_billing_switch_cancelled()
              : m.settings_billing_switch_unchanged(),
          })
          break
        case 'no-subscription':
        case 'blocked':
          toast.add({ type: 'info', title: m.settings_billing_switch_blocked() })
          break
        default:
          toast.add({ type: 'error', title: m.settings_billing_switch_failed() })
      }
      // 切换后刷新：当前方案、待生效变更都变了。
      await load()
    } finally {
      setSwitching(null)
    }
  }

  // 买断订单（一次性购买）单独成列：它们与订阅是两种「付费物」，
  // 页面上必须能看出「买断已经接管了订阅」这件事。
  const purchases = payments?.filter((payment) => payment.type === 'one_time') ?? []
  const hasAnyPlan = (subscriptions?.length ?? 0) + purchases.length > 0

  // 「我的方案」只展示当前生效的那一份，其余收进历史。
  // 判定依据是服务端下发的 `isCurrent`（等级说了算的归属判定），客户端不重复判一遍。
  const display = splitBillingDisplay({
    subscriptions: subscriptions ?? [],
    payments: payments ?? [],
  })
  const historyCount = display.historySubscriptions.length + display.historyPurchases.length
  const currentProductName = productNameForProductId(currentPlan?.productId)

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

      {/* 我的方案：只放当前生效的那一份。买断接管订阅时展示买断那张卡，
          「当前生效」徽章标在真正生效的那一份上。 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {m.settings_billing_my_plans()}
        </h2>
        {currentProductName && (
          <p className="text-sm text-muted-foreground">
            {m.settings_billing_current_level({ name: currentProductName })}
          </p>
        )}
        {subscriptions === null || payments === null ? (
          <Spinner className="size-5" />
        ) : !hasAnyPlan ? (
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
                // 渲染的是 `<a>` 而非 `<button>`：不声明的话 Base UI 会按原生按钮
                // 语义挂 role/键盘行为，并在开发期报「expected a native <button>」。
                nativeButton={false}
                render={<Link to="/{-$locale}/pricing" params={{ locale: getRequestLocale() }} />}
              >
                {m.settings_billing_upgrade_cta()}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-4">
            {display.currentSubscription && (
              <SubscriptionCard
                sub={display.currentSubscription}
                managing={managing}
                switching={switching !== null}
                onManage={() => onManageSubscription(display.currentSubscription?.customerId)}
                onSwitch={onSwitch}
              />
            )}
            {display.currentPurchase && <PurchaseCard purchase={display.currentPurchase} />}
          </div>
        )}
      </section>

      {/* 历史订阅：过往的方案，默认收起。它们不再扣费，但用户偶尔会回来看。 */}
      {historyCount > 0 && (
        <section className="space-y-3">
          <Collapsible>
            <h2>
              <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <span>{m.settings_billing_history_title()}</span>
                <Badge variant="secondary">{historyCount}</Badge>
                {/* `data-panel-open` 由 Base UI trigger 在展开时挂上。 */}
                <IconChevronRight
                  aria-hidden
                  className="ml-auto size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90"
                />
              </CollapsibleTrigger>
            </h2>
            <CollapsibleContent>
              <p className="pt-2 text-sm text-muted-foreground">
                {m.settings_billing_history_desc()}
              </p>
              <ul className="mt-2 divide-y">
                {display.historySubscriptions.map((sub) => (
                  <SubscriptionHistoryRow key={sub.id} sub={sub} />
                ))}
                {display.historyPurchases.map((purchase) => (
                  <PurchaseHistoryRow key={purchase.id} purchase={purchase} />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}

      {/* 切换方案：账号级唯一订阅——换档位只能改现有那份。 */}
      {switchTargets && switchTargets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {m.settings_billing_switch_title()}
          </h2>
          <p className="text-sm text-muted-foreground">{m.settings_billing_switch_desc()}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {switchTargets.map((target) => (
              <SwitchCard
                key={`${target.productId}-${target.interval}`}
                target={target}
                switching={switching === `${target.productId}-${target.interval}`}
                onSwitch={() =>
                  onSwitch(target.productId, target.interval as 'month' | 'year' | 'one_time')
                }
              />
            ))}
          </div>
        </section>
      )}

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
 * 一页通常只有一条订阅，卡片比表格更能一屏读完「方案、下次扣款、怎么改」。
 * `past_due` 是唯一需要用户立刻行动的状态，故单独用 `destructive`。
 */
function SubscriptionCard({
  sub,
  managing,
  switching,
  onManage,
  onSwitch,
}: {
  sub: SubscriptionRecord
  managing: boolean
  /** 是否有切换请求在飞：取消变更按钮同时只允许一个。 */
  switching: boolean
  onManage: () => void
  onSwitch: (productId: string, interval: 'month' | 'year' | 'one_time') => void
}) {
  const productName = productNameForProductId(sub.productId)
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
            <CardTitle className="text-lg">{productName ?? productFallback(sub)}</CardTitle>
            {sub.isCurrent && <Badge variant="default">{m.settings_billing_active_now()}</Badge>}
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
            <span className="text-muted-foreground">
              {/* 已结束的订阅显示「结束于」：说「下次续费」会让用户以为还会扣款。 */}
              {sub.status === 'canceled' || sub.status === 'incomplete_expired'
                ? m.settings_billing_ended_on()
                : m.settings_billing_renews_on_short()}
            </span>
            <span className="font-medium tabular-nums">{formatDateTime(sub.currentPeriodEnd)}</span>
          </div>
        )}
        {sub.pending && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <IconClock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {m.settings_billing_switch_pending_desc({
                  name: productNameForProductId(sub.pending.productId) ?? sub.pending.productId,
                  date: formatDateTime(sub.pending.effectiveAt),
                })}
              </span>
            </div>
            {sub.productId && sub.interval && sub.interval !== 'one_time' && (
              <Button
                variant="outline"
                size="sm"
                disabled={switching}
                onClick={() =>
                  onSwitch(sub.productId as string, sub.interval as 'month' | 'year' | 'one_time')
                }
              >
                {m.settings_billing_switch_cancel()}
              </Button>
            )}
          </div>
        )}
        {sub.superseded && (
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{m.settings_billing_superseded_hint()}</span>
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
 * 一个可切换目标的卡片（档位 × 周期）。
 *
 * 方向（升级 / 降级 / 换周期）由服务端算好再下发：客户端不重复判定，两处各判一次
 * 迟早漂移——最怕的是客户端说「升级」而服务端按「降级」处理，用户被少扣钱。
 */
function SwitchCard({
  target,
  switching,
  onSwitch,
}: {
  target: SwitchTarget
  switching: boolean
  onSwitch: () => void
}) {
  const productName = productNameForProductId(target.productId)
  const intervalKey = subscriptionIntervalMessageKey(target.interval)
  // 取的是消息**键**，要用 m[...]() 换成文案；直接渲染键会把 `settings_billing_interval_month`
  // 这种内部标识漏到页面上。
  const intervalLabel = intervalKey ? m[intervalKey]() : null
  const amount = formatAmount(target.amount, target.currency)
  const directionKey =
    target.direction === 'upgrade'
      ? 'settings_billing_switch_upgrade'
      : target.direction === 'downgrade'
        ? 'settings_billing_switch_downgrade'
        : 'settings_billing_switch_change'
  const hintKey =
    target.direction === 'upgrade'
      ? 'settings_billing_switch_upgrade_hint'
      : target.direction === 'downgrade'
        ? 'settings_billing_switch_downgrade_hint'
        : 'settings_billing_switch_change_hint'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{productName ?? target.productId}</CardTitle>
          {target.isCurrent ? (
            <Badge variant="default">{m.settings_billing_switch_current()}</Badge>
          ) : (
            <Badge variant="outline">{m[directionKey]()}</Badge>
          )}
        </div>
        <CardDescription>
          {amount}
          {intervalLabel ? ` / ${intervalLabel}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{m[hintKey]()}</p>
        <Button
          size="sm"
          variant={target.isCurrent ? 'secondary' : 'default'}
          disabled={target.isCurrent || switching}
          onClick={onSwitch}
        >
          {switching ? <Spinner className="size-4" /> : null}
          {target.isCurrent
            ? m.settings_billing_switch_current()
            : m.settings_billing_switch_action()}
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * 买断订单的摘要卡。
 *
 * 与订阅卡并列展示：买断是「已经拥有」，订阅是「还在付钱」。买断接管订阅后，
 * 两张卡都在列表里，但只有买断那一张带「当前生效」。
 */
function PurchaseCard({ purchase }: { purchase: PaymentRecord }) {
  const productName = productNameForProductId(purchase.productId)
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">
              {productName ?? m.settings_billing_pay_type_one_time()}
            </CardTitle>
            {purchase.isCurrent && (
              <Badge variant="default">{m.settings_billing_active_now()}</Badge>
            )}
            <Badge variant="outline">{m.settings_billing_pay_type_one_time()}</Badge>
          </div>
          <CardDescription>
            {formatAmount(purchase.amount, purchase.currency)}
            {purchase.paidAt ? ` · ${formatDate(purchase.paidAt)}` : ''}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

/**
 * 历史订阅行。
 *
 * 用紧凑行而不是卡片：历史是次要信息，卡片会把「当前方案」淹没——而那正是这个区块
 * 要解决的问题。
 */
function SubscriptionHistoryRow({ sub }: { sub: SubscriptionRecord }) {
  const productName = productNameForProductId(sub.productId)
  const statusKey = subscriptionStatusMessageKey(sub.status)
  // 被更高等级的方案取代的订阅，状态字段还停在「生效中」：徽章要说人话。
  const badgeText = sub.superseded
    ? m.settings_billing_history_superseded()
    : sub.cancelAtPeriodEnd && sub.status === 'active'
      ? m.settings_billing_status_cancel_soon()
      : m[statusKey]()
  const intervalKey = subscriptionIntervalMessageKey(sub.interval)
  const amount = formatAmount(sub.amount, sub.currency)

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{productName ?? productFallback(sub)}</span>
        <Badge variant="outline">{badgeText}</Badge>
      </div>
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="tabular-nums">
          {amount}
          {intervalKey ? ` / ${m[intervalKey]()}` : ''}
        </span>
        {sub.currentPeriodEnd && (
          <span>
            {m.settings_billing_ended_on()} {formatDate(sub.currentPeriodEnd)}
          </span>
        )}
      </div>
    </li>
  )
}

/** 历史买断行：过往的一次性购买。 */
function PurchaseHistoryRow({ purchase }: { purchase: PaymentRecord }) {
  const productName = productNameForProductId(purchase.productId)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{productName ?? purchase.productId ?? '—'}</span>
        <Badge variant="outline">{m.settings_billing_history_type_one_time()}</Badge>
      </div>
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="tabular-nums">{formatAmount(purchase.amount, purchase.currency)}</span>
        <span>
          {m.settings_billing_purchased_on()} {formatDate(purchase.paidAt ?? purchase.createdAt)}
        </span>
      </div>
    </li>
  )
}

/**
 * 订阅卡的产品名兜底。
 *
 * Price 不在映射里时退回显示 Price id：至少是真实数据，能看出是后台手工创建的。
 */
function productFallback(sub: SubscriptionRecord): string {
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
