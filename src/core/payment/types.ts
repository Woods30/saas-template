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
  parseWebhookEvent(rawBody: string, signature: string): Promise<PaymentEvent>
}
