import type { Locale } from '@/config/locale'
import type { PricingInterval } from '@/types/pricing'

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
  customerId?: string
  successUrl: string
  cancelUrl: string
  locale?: Locale
  mode: 'subscription' | 'payment'
  productId: string
  offerId: string
  idempotencyKey: string
  expiresAt?: number
}
export interface CheckoutResult {
  url: string
  sessionId: string
  expiresAt: number
}
export interface PortalParams {
  customerId: string
  returnUrl: string
}
export interface PortalResult {
  url: string
}

export interface ProviderPrice {
  id: string
  reference: string
  amount: number | null
  currency: string
  mode: 'subscription' | 'payment'
  interval: Exclude<PricingInterval, 'one_time'> | null
  intervalCount: number | null
}

export interface ProviderSubscription {
  id: string
  userId: string | null
  customerId: string | null
  priceId: string
  reference: string | null
  /**
   * 直接归属：没有销售引用的链路（如核销型支付）用它携带商品与付费方式。
   * 有值时优先于 `reference` 反查。
   */
  productId?: string | null
  offerId?: string | null
  amount: number | null
  currency: string | null
  interval: string | null
  intervalCount: number | null
  currentPeriodStart: number | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  status: SubscriptionStatus
}

export interface PaymentEvent {
  id: string
  provider: string
  type: string
  created: number
  subscriptionId?: string
  subscription?: ProviderSubscription
  payment?: {
    id: string
    invoiceId: string | null
    chargeId: string | null
    customerId: string | null
    userId: string | null
    productId: string | null
    offerId: string | null
    subscriptionId: string | null
    type: 'subscription' | 'one_time'
    amount: number
    currency: string
    status: 'paid' | 'failed'
  }
  payments?: NonNullable<PaymentEvent['payment']>[]
  refund?: { chargeId: string; amount: number }
  checkoutId?: string
}

/** 取消订阅后的快照。取消一律**期末生效**：本周期内仍是有效订阅。 */
export interface SubscriptionCancellation {
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: number | null
}

/** 渠道的退款状态（两家 provider 的取值收敛到这里）。 */
export type RefundStatus = 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'

export interface RefundParams {
  /** Stripe：PaymentIntent id。 */
  paymentIntentId?: string | null
  /** Creem：交易号。 */
  transactionId?: string | null
  /** 省略表示全额退款。 */
  amount?: number
}

export interface RefundResult {
  status: RefundStatus
}

export interface PaymentProvider {
  getProviderName(): string
  listPrices(references: string[]): Promise<ProviderPrice[]>
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  retrieveCheckoutSession(sessionId: string): Promise<{
    status: 'open' | 'complete' | 'expired'
    subscriptionId: string | null
  }>
  createCustomerPortalLink(params: PortalParams): Promise<PortalResult>
  retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription>
  /** 期末取消：不立即终止，用户用完已付的周期。 */
  cancelSubscription(subscriptionId: string): Promise<SubscriptionCancellation>
  /** 发起退款；返回渠道的受理状态，最终到账以渠道回调为准。 */
  refundPayment(params: RefundParams): Promise<RefundResult>
  parseWebhookEvent(rawBody: string, signature: string): Promise<PaymentEvent>
}
