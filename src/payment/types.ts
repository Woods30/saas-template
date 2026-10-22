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
  /** 定价方案 id；写进 metadata，账单与运营通知据此识别套餐。 */
  planId?: string
}

/**
 * provider 侧的 Price 摘要。
 *
 * 只取展示与结账必需的字段：金额、币种、是否周期计费。Price 的其余属性（阶梯价、
 * 税设置、试用）不在本模板的展示范围内。
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
  parseWebhookEvent(rawBody: string, signature: string): Promise<unknown>
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>
}
