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
  locale?: 'zh' | 'en'
  mode: 'subscription' | 'payment'
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
  parseWebhookEvent(rawBody: string, signature: string): Promise<unknown>
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>
}
