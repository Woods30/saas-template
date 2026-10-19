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
 * 计费周期 → 展示文案的消息键。
 *
 * Stripe 的 `recurring.interval` 取值域是 `day` / `week` / `month` / `year`；本模板
 * 只提供月、年与一次性三种，其余（如在 Stripe 后台改成了按周）落到原始值显示，
 * 不把「按周」硬说成「按月」。
 */
export function subscriptionIntervalMessageKey(
  interval: string | null | undefined,
):
  | 'settings_billing_interval_month'
  | 'settings_billing_interval_year'
  | 'settings_billing_interval_lifetime' {
  switch (interval) {
    case 'month':
      return 'settings_billing_interval_month'
    case 'year':
      return 'settings_billing_interval_year'
    default:
      // 空值与 `one_time` 都归为终身：一次性买断没有「下一期」。
      return 'settings_billing_interval_lifetime'
  }
}
