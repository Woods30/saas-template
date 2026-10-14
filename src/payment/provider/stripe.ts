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
 * 关键点：
 * 1. `httpClient` 用 `Stripe.createFetchHttpClient()`（Workers 原生 fetch）。
 * 2. `webhook` 验签用 `constructEventAsync` + `createSubtleCryptoProvider()`，
 *    因为同步 `constructEvent` 依赖 Node `crypto`，在 Workers 上不可用。
 * 3. `apiVersion` 锁为 2025-09-30.clover（v23.0.0 内置的 latest stable）。
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
      // 调用方已校验为受支持语言；兜底用站点默认语言，而非「非 zh 即 en」——
      // 后者会在新增语言时把新语言错误地当成 en 提交给 Stripe。
      locale: params.locale ?? defaultLocale,
      metadata: { userId: params.userId },
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
