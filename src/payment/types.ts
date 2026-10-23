import type { Locale } from '@/config/locale'

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid'

export interface CheckoutParams {
  priceId: string
  userId: string
  customerEmail: string
  successUrl: string
  cancelUrl: string
  locale?: Locale
  mode: 'subscription' | 'payment'
  /**
   * 本站产品 id（如 `pro`）；写进 metadata。
   *
   * webhook 要靠它判断「这次买断与已有订阅是不是同一个产品」——同一个产品下的月付、
   * 年付与终身是同一个东西的不同价位（买断属于升级，旧订阅要被接管）；不同产品
   * 则是不同的东西，可以并存各自计费。
   */
  productId?: string
  /**
   * Stripe Product id；写进 metadata，作为产品配置没声明互斥关系时的兜底判据。
   */
  stripeProductId?: string
}

/**
 * provider 侧的 Price 摘要。
 *
 * 只取展示与结账必需的字段：金额、币种、是否周期计费、属于哪个 Product。Price 的
 * 其余属性（阶梯价、税设置、试用）不在本模板的展示范围内。
 */
export interface ProviderPrice {
  /** Stripe Price id。 */
  id: string
  /** Price 的 `lookup_key`；手工创建的 Price 可能没有。 */
  lookupKey: string | null
  /** 以「分」为单位；阶梯计价的 Price 为 `null`（无法展示单一价格）。 */
  amount: number | null
  currency: string
  /** 是否有 `recurring`：true 为订阅，false 为一次性付款。 */
  recurring: boolean
  /** Stripe Product id；兜底判定「同一个产品」用，取不到时为 `null`。 */
  stripeProductId: string | null
}

export interface CheckoutResult {
  url: string
  sessionId: string
}

export interface PortalParams {
  customerId: string
  returnUrl: string
}

export interface PortalResult {
  url: string
}

export interface PaymentProvider {
  getProviderName(): string
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  createCustomerPortalLink(params: PortalParams): Promise<PortalResult>
  /**
   * 按 `lookup_key` 批量取价。
   *
   * 定价页的展示价必须来自这里，而不是写死在代码里：Stripe 官方明确说明写死价格
   * 「需要改代码重新部署」，并推荐用 `lookup_key` 作为页面与价格之间的锚点。
   */
  listPricesByLookupKey(lookupKeys: string[]): Promise<ProviderPrice[]>
  /**
   * 取消订阅。
   *
   * `proration: true` 时按未使用的时间折算退款：Stripe 生成一张金额为负的发票，
   * 折算额进入客户的余额（余额为负即客户有钱可抵扣下一张发票）。
   *
   * 买断终身时用它接管旧订阅——官方对 `cancel_at_period_end` 的说明是「This allows
   * the subscription to complete the duration of time the customer has already paid
   * for.」，那是「保留到周期末」的语义；买断场景要的是**立刻停扣**，否则用户在拿到
   * 终身权益后还要被继续月付。
   */
  cancelSubscription(subscriptionId: string, options?: { proration?: boolean }): Promise<void>
  parseWebhookEvent(rawBody: string, signature: string): Promise<unknown>
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>
}
