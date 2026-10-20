import { getPricingPlans } from '@/config/blocks'
import { findPlanIdByPriceId } from '@/config/payment'

/**
 * 账单页的行数据形状。
 *
 * 单独一个模块（而不是塞在 `billing.ts` 里）与 `admin-users-query.ts` 同一考虑：
 * server function 需要动态 import 才能不把 D1 binding 拉进客户端 bundle，而客户端
 * 组件只需要类型。类型放在无副作用的模块里，两端都能安全引用。
 *
 * 时间字段写成 `Date | string`：Drizzle 从 D1 读出来是 `Date`，但经过 server
 * function 的序列化边界会变成 ISO 字符串，客户端渲染时两种都可能出现。
 */

/** 订阅记录的计费周期；来自 Stripe Price 的 `recurring.interval`。 */
export type BillingInterval = 'month' | 'year' | 'one_time' | (string & {})

export interface SubscriptionRecord {
  id: string
  customerId?: string | null
  subscriptionId?: string | null
  status: string
  priceId?: string | null
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
 * 归一化在这里做而不是在组件里：`SubscriptionStatus` 是 Stripe 的取值集合，
 * Stripe 未来新增状态时组件不会因为 `switch` 没覆盖而崩。未知状态落到 `fallback`。
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
      // `paused` 等未单独设计文案的状态，显示原始值比编一个模糊词更利于排障。
      return 'settings_billing_status'
  }
}

/**
 * 订阅 → 展示用套餐名。
 *
 * 反向查 `priceMap`（同一份「定价页 plan ↔ Stripe Price」映射）：新增 plan 或换
 * Price ID 时账单页自动跟上，不需要再维护一张对照表。
 *
 * 查不到时返回 `undefined` 而不是猜测：Price 可能是在 Stripe 后台手工创建的，
 * 调用方据此退回显示 Price id——看起来不像站内套餐，但至少是真实数据。
 */
export function planNameForSubscription(
  priceId: string | null | undefined,
  priceMap: import('@/config/payment').PriceMap,
): string | undefined {
  if (!priceId) return undefined
  const planId = findPlanIdByPriceId(priceMap, priceId)
  if (!planId) return undefined
  return getPricingPlans().find((plan) => plan.id === planId)?.name
}

/**
 * 付款状态 → 展示文案的消息键。
 *
 * 与订阅状态是两套取值域，不能互相复用：`payments.status` 只有 `paid` / `refunded`
 * （见 `handleInvoicePaid` 与一次性支付路径），而「生效中」是订阅的 `active` 的文案。
 * 此前交易记录直接调订阅的映射，于是每一笔已付款都显示成「生效中」——用户看到的
 * 是一个既不属于付款语义、又无法区分退款的状态。
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

/** 计费周期的展示文案键；`null` 表示周期未知（见 `subscriptionIntervalMessageKey`）。 */
export type BillingIntervalMessageKey =
  | 'settings_billing_interval_month'
  | 'settings_billing_interval_year'
  | 'settings_billing_interval_lifetime'

/**
 * 计费周期 → 展示文案的消息键；周期未知时返回 `null`。
 *
 * Stripe 的 `recurring.interval` 取值域是 `day` / `week` / `month` / `year`；本模板
 * 只提供月、年与一次性三种，其余（如在 Stripe 后台改成了按周）同样返回 `null`。
 *
 * **空值不能归为终身**：`checkout.session.completed` 先插入订阅行（此时只写
 * `status` 与 `customer`，`interval` 还空着），周期要等 `customer.subscription.created`
 * 才补齐。把空值当成 `one_time`，会让这段时间里的月付订阅显示成「终身」。
 *
 * **未知也不编一个状态词**：曾试过返回「周期待同步」，但那是后端实现细节（第二个
 * webhook 还没到），用户既看不懂也无法据此行动。返回 `null` 让调用方只渲染金额，
 * 把「不知道」表达为「不说」，比说一句用户读不懂的话更诚实。
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
