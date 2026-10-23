import Stripe from 'stripe'
import { defaultLocale } from '@/config/locale'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  PortalParams,
  PortalResult,
  ProviderPrice,
} from '../types'

/**
 * Stripe 的「资源不存在」错误。
 *
 * 已取消的订阅再取消一次，Stripe 返回 `resource_missing`（"No such subscription"），
 * 而这正是「已经停掉」的目标状态，不该当成失败。
 */
function isResourceMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  return (err as { code?: unknown }).code === 'resource_missing'
}

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
    const metadata = {
      userId: params.userId,
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.stripeProductId ? { stripeProductId: params.stripeProductId } : {}),
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: params.mode,
      line_items: [{ price: params.priceId, quantity: 1 }],
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // 兜底用站点默认语言，而非「非 zh 即 en」，否则新增语言会被当成 en 提交。
      locale: params.locale ?? defaultLocale,
      metadata,
      // Checkout Session 自己的 metadata **不会**被 Stripe 复制到 Subscription
      // （实测订阅对象上的 metadata 是空的）。归属必须显式写进
      // `subscription_data.metadata`：否则 `customer.subscription.created` 早于
      // `checkout.session.completed` 到达时，这条订阅无从知道属于谁——
      // 补建不了，价格与周期也就永远补不上。
      ...(params.mode === 'subscription' ? { subscription_data: { metadata } } : {}),
      ...(params.mode === 'payment' ? { invoice_creation: { enabled: true } } : {}),
      ...(params.mode === 'payment' ? { allow_promotion_codes: true } : {}),
    })
    return { url: session.url ?? '', sessionId: session.id }
  }

  /**
   * 按 `lookup_key` 批量取价。
   *
   * 用 `lookup_keys[]` 而非逐个查 id：一次请求拿完所有展示价，且 key 换 Price 后
   * 不用改代码。`prices.list` 默认只返回 active 的 Price。
   */
  async listPricesByLookupKey(lookupKeys: string[]): Promise<ProviderPrice[]> {
    if (lookupKeys.length === 0) return []
    const prices = await this.stripe.prices.list({ lookup_keys: lookupKeys })
    return prices.data.map((price) => ({
      id: price.id,
      lookupKey: price.lookup_key,
      amount: price.unit_amount,
      currency: price.currency,
      recurring: Boolean(price.recurring),
      stripeProductId:
        typeof price.product === 'string' ? price.product : (price.product?.id ?? null),
    }))
  }

  /**
   * 取消订阅；`proration` 为真时按未使用时间折算退款。
   *
   * `prorate + invoice_now` 的组合会立刻生成一张金额为负的发票：折算额进入客户
   * 余额（余额为负 = 客户有钱），即「没用掉的时间退给客户」。
   */
  async cancelSubscription(
    subscriptionId: string,
    options?: { proration?: boolean },
  ): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(
        subscriptionId,
        options?.proration ? { prorate: true, invoice_now: true } : undefined,
      )
    } catch (err) {
      // 订阅已经不在了（首次取消已成功，这次是 webhook 重投）：目标状态已达成，
      // 不算失败。不这样处理的话，重投会永远撞上「No such subscription」，
      // 事件再也处理不完。
      if (isResourceMissing(err)) return
      throw err
    }
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
