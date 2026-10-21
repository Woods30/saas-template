import Stripe from 'stripe'
import { defaultLocale } from '@/config/locale'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  PortalParams,
  PortalResult,
} from '../types'

/**
 * Stripe payment provider — Cloudflare Workers 适配。
 *
 * 必须用 `createFetchHttpClient()`，且验签走 `constructEventAsync` +
 * `createSubtleCryptoProvider()`：同步的 `constructEvent` 依赖 Node `crypto`，
 * 在 Workers 上不可用。
 */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe
  private readonly webhookSecret: string

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    })
    this.webhookSecret = webhookSecret
  }

  getProviderName() {
    return 'stripe'
  }

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: params.mode,
      line_items: [{ price: params.priceId, quantity: 1 }],
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // 兜底用站点默认语言，而非「非 zh 即 en」，否则新增语言会被当成 en 提交。
      locale: params.locale ?? defaultLocale,
      metadata: { userId: params.userId },
      // Checkout Session 自己的 metadata **不会**被 Stripe 复制到 Subscription
      // （实测订阅对象上的 metadata 是空的）。归属必须显式写进
      // `subscription_data.metadata`：否则 `customer.subscription.created` 早于
      // `checkout.session.completed` 到达时，这条订阅无从知道属于谁——
      // 补建不了，价格与周期也就永远补不上。
      ...(params.mode === 'subscription'
        ? { subscription_data: { metadata: { userId: params.userId } } }
        : {}),
      ...(params.mode === 'payment' ? { invoice_creation: { enabled: true } } : {}),
      ...(params.mode === 'payment' ? { allow_promotion_codes: true } : {}),
    })
    return { url: session.url ?? '', sessionId: session.id }
  }

  async createCustomerPortalLink(params: PortalParams): Promise<PortalResult> {
    const portal = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    })
    return { url: portal.url }
  }

  async parseWebhookEvent(rawBody: string, signature: string): Promise<unknown> {
    return this.stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
    try {
      await this.parseWebhookEvent(rawBody, signature)
      return true
    } catch {
      return false
    }
  }
}
