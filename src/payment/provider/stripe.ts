import Stripe from 'stripe'
import { defaultLocale } from '@/config/locale'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentEvent,
  PaymentProvider,
  PortalParams,
  PortalResult,
  ProviderPrice,
  ProviderSubscription,
} from '../types'

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return null
}

function snapshot(subscription: Stripe.Subscription): ProviderSubscription {
  const item = subscription.items.data[0]
  const price = item?.price
  return {
    id: subscription.id,
    userId: subscription.metadata.userId ?? null,
    customerId: idOf(subscription.customer),
    priceId: price?.id ?? '',
    reference: price?.lookup_key ?? null,
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    intervalCount: price?.recurring?.interval_count ?? null,
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    status: subscription.status as ProviderSubscription['status'],
  }
}

interface StripeEventInput {
  id: string
  type: string
  created: number
  data: { object: unknown }
}

/** 仅适配器了解 Stripe 的事件结构；业务层只消费归一化结果。 */
export function normalizeStripeEvent(event: StripeEventInput): PaymentEvent {
  const result: PaymentEvent = {
    id: event.id,
    provider: 'stripe',
    type: event.type,
    created: event.created,
  }
  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as Stripe.Subscription
    result.subscriptionId = sub.id
    result.subscription = snapshot(sub)
  } else if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    result.checkoutId = session.id
    result.subscriptionId = idOf(session.subscription) ?? undefined
    if (
      session.mode === 'payment' &&
      (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
    ) {
      result.payment = {
        id: idOf(session.payment_intent) ?? session.id,
        invoiceId: idOf(session.invoice),
        chargeId: idOf(session.payment_intent),
        customerId: idOf(session.customer),
        userId: session.metadata?.userId ?? null,
        productId: session.metadata?.productId ?? null,
        offerId: session.metadata?.offerId ?? null,
        subscriptionId: null,
        type: 'one_time',
        amount: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        status: 'paid',
      }
    }
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    // 发票是支付成功的**权威**事件：Stripe 不保证事件顺序，webhook 端点也可能只投递
    // `invoice.*`（漏配 `checkout.session.completed`）。付款记录不能单点依赖后者。
    //
    // 归属来源分两种：订阅付款在 `parent.subscription_details`；一次性付款由
    // `createCheckoutSession` 写进 `invoice.metadata`。
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
    result.subscriptionId = subscriptionId ?? undefined
    const metadata = subscriptionId
      ? invoice.parent?.subscription_details?.metadata
      : invoice.metadata
    result.payment = {
      id: invoice.id,
      invoiceId: invoice.id,
      chargeId: null,
      customerId: idOf(invoice.customer),
      userId: metadata?.userId ?? null,
      // 订阅的 product/offer 由 subscriptions 表提供（applyPaymentEvent 会优先用它）。
      productId: subscriptionId ? null : (metadata?.productId ?? null),
      offerId: subscriptionId ? null : (metadata?.offerId ?? null),
      subscriptionId: subscriptionId ?? null,
      type: subscriptionId ? 'subscription' : 'one_time',
      amount: event.type === 'invoice.paid' ? invoice.amount_paid : invoice.amount_due,
      currency: invoice.currency,
      status: event.type === 'invoice.paid' ? 'paid' : 'failed',
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    result.refund = {
      chargeId: idOf(charge.payment_intent) ?? charge.id,
      amount: charge.amount_refunded,
    }
  }
  return result
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe
  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() })
  }
  getProviderName() {
    return 'stripe'
  }

  async listPrices(references: string[]): Promise<ProviderPrice[]> {
    const result: ProviderPrice[] = []
    // Stripe lookup_keys 单次最多 10 个，分页也必须完整读取。
    for (let offset = 0; offset < references.length; offset += 10) {
      for await (const price of this.stripe.prices.list({
        active: true,
        lookup_keys: references.slice(offset, offset + 10),
        limit: 100,
      })) {
        if (!price.lookup_key) continue
        result.push({
          id: price.id,
          reference: price.lookup_key,
          amount: price.unit_amount,
          currency: price.currency,
          mode: price.recurring ? 'subscription' : 'payment',
          interval: (price.recurring?.interval ?? null) as ProviderPrice['interval'],
          intervalCount: price.recurring?.interval_count ?? null,
        })
      }
    }
    return result
  }

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const metadata = { userId: params.userId, productId: params.productId, offerId: params.offerId }
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: params.mode,
        ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
        line_items: [{ price: params.priceId, quantity: 1 }],
        ...(params.customerId
          ? { customer: params.customerId }
          : { customer_email: params.customerEmail }),
        ...(params.mode === 'payment'
          ? {
              ...(!params.customerId ? { customer_creation: 'always' as const } : {}),
              // 一次性支付也开发票：`invoice.paid` 是支付成功的权威事件，
              // 发票上必须带归属，否则该事件单独到达时无法定位用户。
              invoice_creation: { enabled: true, invoice_data: { metadata } },
            }
          : { subscription_data: { metadata } }),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        locale: params.locale ?? defaultLocale,
        metadata,
        ...(params.mode === 'payment' ? { payment_intent_data: { metadata } } : {}),
      },
      { idempotencyKey: params.idempotencyKey },
    )
    if (!session.url) throw new Error('Checkout URL missing')
    return { url: session.url, sessionId: session.id, expiresAt: session.expires_at }
  }

  async retrieveCheckoutSession(sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId)
    const status = session.status
    if (status !== 'open' && status !== 'complete' && status !== 'expired')
      throw new Error('Checkout status unavailable')
    return {
      status: status as 'open' | 'complete' | 'expired',
      subscriptionId: idOf(session.subscription),
    }
  }

  async createCustomerPortalLink(params: PortalParams): Promise<PortalResult> {
    const portal = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    })
    return { url: portal.url }
  }
  async retrieveSubscription(id: string): Promise<ProviderSubscription> {
    return snapshot(await this.stripe.subscriptions.retrieve(id, { expand: ['items.data.price'] }))
  }
  async parseWebhookEvent(raw: string, signature: string): Promise<PaymentEvent> {
    const event = await this.stripe.webhooks.constructEventAsync(
      raw,
      signature,
      this.webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
    const result = normalizeStripeEvent(event)
    if (result.subscriptionId && event.type !== 'customer.subscription.deleted') {
      result.subscription = await this.retrieveSubscription(result.subscriptionId)
    }
    if (result.payment?.invoiceId) {
      const entries: NonNullable<PaymentEvent['payments']> = []
      for await (const entry of this.stripe.invoicePayments.list({
        invoice: result.payment.invoiceId,
        limit: 100,
      })) {
        if (entry.status !== 'paid') continue
        const paymentIntentId = idOf(entry.payment.payment_intent)
        entries.push({
          ...result.payment,
          // 外部 ID 统一用 PaymentIntent：同一笔钱可能被 `invoice.paid` 与
          // `checkout.session.completed` 两条路径各看到一次，ID 不一致会写成两条记录。
          // 零金额订单（全额折扣）没有 PaymentIntent，退回用 InvoicePayment 的 ID。
          id: paymentIntentId ?? entry.id,
          amount: entry.amount_paid ?? 0,
          chargeId: paymentIntentId,
          status: 'paid',
        })
      }
      if (entries.length) {
        result.payments = entries
        delete result.payment
      }
    }
    return result
  }
}
