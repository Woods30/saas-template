import { getPricingPlans } from '@/config/pricing'

/**
 * 账单页的行数据形状。单独成模块，让客户端组件只引类型而不把 D1 binding 带进 bundle。
 *
 * 时间字段写成 `Date | string`：Drizzle 读出是 `Date`，经 server function 序列化后
 * 变成 ISO 字符串，客户端两种都可能遇到。
 */

/** 订阅记录的计费周期；来自 Stripe Price 的 `recurring.interval`。 */
export type BillingInterval = 'month' | 'year' | 'one_time' | (string & {})

export interface SubscriptionRecord {
  id: string
  customerId?: string | null
  subscriptionId?: string | null
  status: string
  priceId?: string | null
  /**
   * 定价方案 id。
   *
   * 由服务端按 `lookup_key` 反查得出：DB 里只存 Stripe 的 Price id，而 Price id
   * 与「用户买的是哪个套餐」之间隔着一次映射。取不到时为 `null`，页面退回显示
   * Price id（真实数据，好过编一个名字）。
   */
  planId?: string | null
  amount?: number | null
  currency?: string | null
  interval?: BillingInterval | null
  currentPeriodStart?: Date | string | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
  createdAt: Date | string
}

export interface PaymentRecord {
  id: string
  /** `subscription` / `invoice` / `one_time`。 */
  type: string
  /** `paid` / `refunded`。 */
  status: string
  /** 以「分」为单位。 */
  amount: number
  currency: string
  description?: string | null
  paidAt?: Date | string | null
  refundedAt?: Date | string | null
  createdAt: Date | string
}

/**
 * 订阅状态 → 展示文案的消息键。
 *
 * 归一化放在这里而非组件：Stripe 新增状态时组件不会因 `switch` 没覆盖而崩。
 */
export function subscriptionStatusMessageKey(
  status: string,
):
  | 'settings_billing_active'
  | 'settings_billing_cancelled'
  | 'settings_billing_past_due'
  | 'settings_billing_trialing'
  | 'settings_billing_status' {
  switch (status) {
    case 'active':
      return 'settings_billing_active'
    case 'canceled':
    case 'incomplete_expired':
      return 'settings_billing_cancelled'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'settings_billing_past_due'
    case 'trialing':
      return 'settings_billing_trialing'
    default:
      return 'settings_billing_status'
  }
}

/**
 * 定价方案 id → 展示用套餐名。
 *
 * 名字按**当前语言**取自 `getPricingPlans()`，不在服务端算：server function 拿不到
 * 页面的 locale，算出来的名字可能与页面语言对不上。
 *
 * 查不到时返回 `undefined`：方案可能已下线，调用方退回显示 Price id。
 */
export function planNameForPlanId(planId: string | null | undefined): string | undefined {
  if (!planId) return undefined
  return getPricingPlans().find((plan) => plan.id === planId)?.name
}

/**
 * 付款状态 → 展示文案的消息键。
 *
 * 与订阅状态是两套取值域，不能互相复用：复用会把每一笔已付款显示成订阅的「生效中」。
 */
export function paymentStatusMessageKey(
  status: string,
): 'settings_billing_paid' | 'settings_billing_refunded' | 'settings_billing_payment_status' {
  switch (status) {
    case 'paid':
      return 'settings_billing_paid'
    case 'refunded':
      return 'settings_billing_refunded'
    default:
      return 'settings_billing_payment_status'
  }
}

/** 计费周期的展示文案键。 */
export type BillingIntervalMessageKey =
  | 'settings_billing_interval_month'
  | 'settings_billing_interval_year'
  | 'settings_billing_interval_lifetime'

/**
 * 计费周期 → 展示文案的消息键；未知周期返回 `null`，调用方只渲染金额。
 *
 * **空值不能归为终身**：`checkout.session.completed` 先插入订阅行（`interval` 还空着），
 * 要等 `customer.subscription.created` 才补齐；当成 `one_time` 会让月付显示成「终身」。
 */
export function subscriptionIntervalMessageKey(
  interval: string | null | undefined,
): BillingIntervalMessageKey | null {
  switch (interval) {
    case 'month':
      return 'settings_billing_interval_month'
    case 'year':
      return 'settings_billing_interval_year'
    case 'one_time':
      return 'settings_billing_interval_lifetime'
    default:
      return null
  }
}
