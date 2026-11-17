import type {
  CheckoutParams,
  CheckoutResult,
  PaymentEvent,
  PaymentProvider,
  PortalParams,
  PortalResult,
  ProviderPrice,
  ProviderSubscription,
  SubscriptionStatus,
} from '../types'

/**
 * Creem 适配器（Merchant of Record）。
 *
 * 与 Stripe 的差异都收敛在这一层：
 * - 商品即价格：Creem 没有 lookup_key，结账用 `product_id`（`prod_*`）；
 * - 没有 cancel_url，取消只能回 Creem 自己的页面；
 * - 金额是**税前**价，结账页会加税，展示价与实付可能不同；
 * - Webhook 用 `creem-signature`（HMAC-SHA256 十六进制），不是 Stripe 的 t=,v1= 格式。
 *
 * 业务层只消费归一化后的 `PaymentEvent` / `ProviderSubscription`，不感知这些差异。
 */

const PRODUCTION_BASE_URL = 'https://api.creem.io'
const SANDBOX_BASE_URL = 'https://test-api.creem.io'
/** Creem 不返回 checkout 过期时间；本地按 24 小时预留，与 Stripe 的默认一致。 */
const CHECKOUT_TTL_SECONDS = 24 * 60 * 60

type CreemObject = Record<string, unknown>

export interface CreemEventInput {
  id: string
  eventType: string
  created_at: number
  object: CreemObject
}

export interface CreemProduct {
  id: string
  price?: number | null
  currency?: string | null
  billing_type?: string | null
  billing_period?: string | null
}

export interface CreemSubscription {
  id: string
  status?: string | null
  product?: string | CreemProduct | null
  customer?: string | CreemObject | null
  items?: Array<{ price_id?: string | null; product_id?: string | null }> | null
  metadata?: CreemObject | null
  current_period_start_date?: string | null
  current_period_end_date?: string | null
  last_transaction?: CreemObject | null
}

/** 签名不匹配：Webhook 路由据此返回 400 而不是 500。 */
export class CreemSignatureError extends Error {
  constructor() {
    super('CREEM_SIGNATURE_INVALID')
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asObject(value: unknown): CreemObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as CreemObject) : null
}

function idOf(value: unknown): string | null {
  const direct = str(value)
  if (direct) return direct
  return str(asObject(value)?.id)
}

function epochSeconds(value: unknown): number | null {
  const iso = str(value)
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

/**
 * 解析 `reference=productId` 列表（`CREEM_PRODUCTS`）。
 *
 * 商品引用仍写在 `src/config/products.ts`，Creem 的商品 ID 由部署环境提供：
 * 同一份代码换一个 Creem 店铺不需要改代码。
 */
export function parseCreemProducts(value: string | undefined): Record<string, string> {
  if (!value) return {}
  const products: Record<string, string> = {}
  for (const entry of value.split(',')) {
    const [reference, productId] = entry.split('=').map((part) => part.trim())
    if (!reference || !productId) continue
    products[reference] = productId
  }
  return products
}

/** Creem 的 `billing_period` → 我们的 interval 与次数。 */
export function creemInterval(period: string | null | undefined): {
  interval: ProviderPrice['interval']
  intervalCount: number | null
} {
  const periods: Record<string, { interval: ProviderPrice['interval']; intervalCount: number }> = {
    'every-day': { interval: 'day', intervalCount: 1 },
    'every-week': { interval: 'week', intervalCount: 1 },
    'every-month': { interval: 'month', intervalCount: 1 },
    'every-three-months': { interval: 'month', intervalCount: 3 },
    'every-six-months': { interval: 'month', intervalCount: 6 },
    'every-year': { interval: 'year', intervalCount: 1 },
  }
  const found = period ? periods[period] : undefined
  return found ?? { interval: null, intervalCount: null }
}

/** 常量时间比较，避免用字符串比较泄漏签名前缀。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 校验 `creem-signature`：HMAC-SHA256(原文, webhook secret) 的十六进制串。 */
export async function verifyCreemSignature(
  raw: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)),
  )
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature.toLowerCase())
}

/** Creem 的订阅状态 → 我们的中立状态。 */
function mapSubscriptionStatus(status: string | null): {
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
} {
  // 周期末取消：本周期内仍是有效订阅，靠 cancelAtPeriodEnd 表达。
  if (status === 'scheduled_cancel') return { status: 'active', cancelAtPeriodEnd: true }
  // Creem 文档：expired 仍可恢复，按 past_due 记录。
  if (status === 'expired') return { status: 'past_due', cancelAtPeriodEnd: false }
  const known: readonly SubscriptionStatus[] = [
    'active',
    'canceled',
    'unpaid',
    'paused',
    'trialing',
    'past_due',
  ]
  const matched = known.find((value) => value === status)
  return matched
    ? { status: matched, cancelAtPeriodEnd: false }
    : { status: 'incomplete', cancelAtPeriodEnd: false }
}

function toProviderSubscription(
  subscription: CreemSubscription | CreemObject,
  referenceOf: (productId: string) => string | null,
): ProviderSubscription {
  const product = asObject(subscription.product)
  const items = Array.isArray(subscription.items) ? subscription.items : []
  const productId = str(product?.id) ?? str(items[0]?.product_id)
  const interval =
    str(product?.billing_type) === 'recurring'
      ? creemInterval(str(product?.billing_period))
      : { interval: null, intervalCount: null }
  const mapped = mapSubscriptionStatus(str(subscription.status))

  return {
    id: str(subscription.id) ?? '',
    userId: str(asObject(subscription.metadata)?.userId),
    customerId: idOf(subscription.customer),
    priceId: str(items[0]?.price_id) ?? productId ?? '',
    reference: productId ? referenceOf(productId) : null,
    amount: num(product?.price),
    currency: str(product?.currency)?.toLowerCase() ?? null,
    interval: interval.interval,
    intervalCount: interval.intervalCount,
    currentPeriodStart: epochSeconds(subscription.current_period_start_date),
    currentPeriodEnd: epochSeconds(subscription.current_period_end_date),
    cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
    status: mapped.status,
  }
}

/**
 * 把 Creem 事件归一化成业务层的中立结构。
 *
 * 订阅归属优先取订阅自带的 metadata；`checkout.completed` 时退回复用 checkout 的
 * metadata（订阅上未必带 userId）。两者都没有时 `applyPaymentEvent` 会抛错让 Creem
 * 重试，等带归属的事件到达。
 */
export function normalizeCreemEvent(
  event: CreemEventInput,
  referenceOf: (productId: string) => string | null,
): PaymentEvent {
  const object = asObject(event.object) ?? {}
  const type = str(event.eventType) ?? ''
  const result: PaymentEvent = {
    id: str(event.id) ?? '',
    provider: 'creem',
    type,
    created: Math.floor(Number(event.created_at ?? 0) / 1000),
  }

  if (type === 'checkout.completed') {
    const metadata = asObject(object.metadata) ?? {}
    const product = asObject(object.product)
    const order = asObject(object.order)
    const subscription = asObject(object.subscription)

    if (subscription) {
      result.subscriptionId = str(subscription.id) ?? undefined
      result.subscription = toProviderSubscription(subscription, referenceOf)
      if (result.subscription && !result.subscription.userId) {
        result.subscription.userId = str(metadata.userId)
      }
    }

    // 一次性付款由 order 表达；订阅的首笔付款由随后的 `subscription.paid` 记录。
    const oneTime = product?.billing_type === 'one_time' || order?.type === 'one_time'
    if (oneTime && order) {
      result.payment = {
        id: str(order.transaction) ?? str(order.id) ?? '',
        invoiceId: null,
        chargeId: null,
        customerId: idOf(object.customer),
        userId: str(metadata.userId),
        productId: str(metadata.productId),
        offerId: str(metadata.offerId),
        subscriptionId: null,
        type: 'one_time',
        amount: num(order.amount_paid) ?? num(order.amount) ?? 0,
        currency: str(order.currency)?.toLowerCase() ?? '',
        status: 'paid',
      }
    }
    return result
  }

  if (type.startsWith('subscription.')) {
    result.subscriptionId = str(object.id) ?? undefined
    result.subscription = toProviderSubscription(object, referenceOf)

    // `subscription.paid` 是订阅付款的权威事件（首笔与每次续费都会发）。
    if (type === 'subscription.paid') {
      const transaction = asObject(object.last_transaction)
      if (transaction) {
        result.payment = {
          id: str(transaction.id) ?? '',
          invoiceId: null,
          chargeId: null,
          customerId: idOf(object.customer),
          userId: result.subscription?.userId ?? null,
          productId: null,
          offerId: null,
          subscriptionId: str(object.id),
          type: 'subscription',
          amount: num(transaction.amount_paid) ?? num(transaction.amount) ?? 0,
          currency: str(transaction.currency)?.toLowerCase() ?? '',
          status: 'paid',
        }
      }
    }
  }

  return result
}

export class CreemPaymentProvider implements PaymentProvider {
  private readonly baseUrl: string
  private readonly referenceOf: (productId: string) => string | null

  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret: string,
    private readonly products: Record<string, string>,
    debug = false,
  ) {
    this.baseUrl = debug ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
    this.referenceOf = (productId) =>
      Object.entries(products).find(([, id]) => id === productId)?.[0] ?? null
  }

  getProviderName() {
    return 'creem'
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
        ...init?.headers,
      },
    })
    if (!response.ok) throw new Error(`Creem API ${response.status}`)
    return (await response.json()) as T
  }

  private getProduct(productId: string): Promise<CreemProduct> {
    return this.request<CreemProduct>(`/v1/products/${productId}`)
  }

  async listPrices(references: string[]): Promise<ProviderPrice[]> {
    const prices: ProviderPrice[] = []
    for (const reference of references) {
      const productId = this.products[reference]
      if (!productId) continue
      const product = await this.getProduct(productId)
      const interval =
        product.billing_type === 'recurring'
          ? creemInterval(product.billing_period)
          : { interval: null, intervalCount: null }
      prices.push({
        id: product.id,
        reference,
        amount: product.price ?? null,
        currency: (product.currency ?? '').toLowerCase(),
        mode: product.billing_type === 'recurring' ? 'subscription' : 'payment',
        interval: interval.interval,
        intervalCount: interval.intervalCount,
      })
    }
    return prices
  }

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const session = await this.request<{
      id: string
      checkout_url: string
    }>('/v1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        // Creem 的商品就是价格：`priceId` 存的是 `prod_*`。
        product_id: params.priceId,
        request_id: params.idempotencyKey,
        success_url: params.successUrl,
        customer: { email: params.customerEmail },
        metadata: {
          userId: params.userId,
          productId: params.productId,
          offerId: params.offerId,
        },
      }),
    })
    if (!session.checkout_url) throw new Error('Checkout URL missing')
    return {
      url: session.checkout_url,
      sessionId: session.id,
      expiresAt: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    }
  }

  async retrieveCheckoutSession(sessionId: string) {
    const session = await this.request<{
      status?: string | null
      subscription?: string | CreemObject | null
    }>(`/v1/checkouts/${sessionId}`)
    // pending / processing 都还在进行中；Creem 没有单独的「open」状态。
    const status =
      session.status === 'completed'
        ? ('complete' as const)
        : session.status === 'expired'
          ? ('expired' as const)
          : ('open' as const)
    return { status, subscriptionId: idOf(session.subscription) }
  }

  async createCustomerPortalLink(params: PortalParams): Promise<PortalResult> {
    const portal = await this.request<{ customer_portal_link?: string }>('/v1/customers/billing', {
      method: 'POST',
      body: JSON.stringify({ customer_id: params.customerId }),
    })
    if (!portal.customer_portal_link) throw new Error('Portal URL missing')
    return { url: portal.customer_portal_link }
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription> {
    const subscription = await this.request<CreemSubscription>(`/v1/subscriptions/${id}`)
    return toProviderSubscription(subscription, this.referenceOf)
  }

  async parseWebhookEvent(raw: string, signature: string): Promise<PaymentEvent> {
    if (!(await verifyCreemSignature(raw, signature, this.webhookSecret))) {
      throw new CreemSignatureError()
    }
    return normalizeCreemEvent(JSON.parse(raw) as CreemEventInput, this.referenceOf)
  }
}
