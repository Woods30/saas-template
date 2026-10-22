import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getPricingPlans } from '@/config/pricing'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getServerContext } from '@/lib/server-context'
import { notify } from '@/notification'
import { getPaymentProvider } from '@/payment'
import type { SubscriptionStatus } from '@/payment/types'

/**
 * Stripe webhook：幂等（`webhook_events`）+ 失败重投。
 *
 * 必须按 API `2025-09-30.clover` 的字段读取：旧字段不报错，只会是 `undefined`，
 * 导致金额、charge id、周期静默写错，而 webhook 仍返回 200。
 */

/** `invoice.paid` 事件中实际用到的字段（API 2025-09-30.clover 结构）。 */
interface InvoicePaidObject {
  id?: string
  customer?: string | { id: string } | null
  amount_paid: number
  currency: string
  created: number
  /** 新 API：订阅信息挂在 parent 上。 */
  parent?: {
    subscription_details?: {
      subscription?: string | { id: string }
    } | null
  } | null
  /** 新 API：支付记录列表，`payment` 里才有 charge / payment_intent。 */
  payments?: {
    data?: Array<{
      payment?: {
        charge?: string | { id: string }
        payment_intent?: string | { id: string }
      }
    }>
  } | null
  /** 发票行项。套餐与金额只取首行：本模板是单价格订阅，后续行是税、积分等。 */
  lines?: {
    data?: Array<{
      /** 行项金额（分）。含税与折扣，比 `price.unit_amount` 更接近实付。 */
      amount?: number
      currency?: string
      description?: string | null
      pricing?: {
        /** 2025-09-30.clover 把 price 收进了 `pricing.price_details`。 */
        price_details?: {
          price?: string | { id?: string }
          product?: string
        } | null
        type?: string
      } | null
    }>
  } | null
}

/** `customer.subscription.*` 事件中实际用到的字段。 */
interface SubscriptionObject {
  id: string
  status: string
  cancel_at_period_end?: boolean
  /** 归属来自创建 session 时写入的 `subscription_data.metadata`。 */
  metadata?: { userId?: string } | null
  customer?: string | { id: string } | null
  items: {
    data: Array<{
      price: {
        id: string
        currency?: string
        /** 一次性 Price 没有 `recurring`。 */
        recurring?: { interval?: string } | null
        unit_amount?: number | null
      }
      /** 周期在**订阅项**上，不在订阅顶层。 */
      current_period_start: number
      current_period_end: number
    }>
  }
}

/** Stripe 的 id 字段可能是字符串或已展开对象。 */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/** 秒级时间戳 → Date；缺失或非法时返回 `undefined`，绝不写 `Invalid Date`。 */
function toDate(seconds: number | null | undefined): Date | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * 从 Invoice 中取 charge id，取不到时退回 payment_intent id。
 *
 * 新 API 里 `payment.charge` 只在没有 PaymentIntent 时才直接给出。退回 PI id 无法
 * 匹配 `charge.refunded`，但至少说明「这是 PI 支付」，比写 `null` 可排障。
 */
function chargeIdFromInvoice(invoice: InvoicePaidObject): string | null {
  const entries = invoice.payments?.data ?? []
  for (const entry of entries) {
    const charge = idOf(entry.payment?.charge)
    if (charge) return charge
  }
  for (const entry of entries) {
    const intent = idOf(entry.payment?.payment_intent)
    if (intent) return intent
  }
  return null
}

/** 从 Invoice 中取订阅 id（新 API 在 `parent.subscription_details.subscription`）。 */
function subscriptionIdFromInvoice(invoice: InvoicePaidObject): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription)
}

/** 从 Invoice 首行取 Price id；取不到返回 `undefined`，不猜。 */
function priceIdFromInvoice(invoice: InvoicePaidObject): string | undefined {
  const price = invoice.lines?.data?.[0]?.pricing?.price_details?.price
  if (typeof price === 'string') return price
  return price?.id
}

/**
 * Price id → 展示用套餐名。
 *
 * 反查走 Stripe 的实时价格目录（Price id → lookup_key → plan id），新增 plan 时
 * 无需改这里。查不到返回 `undefined`：Price 可能是后台手工创建的，调用方退回
 * 显示 Price id。
 *
 * 取价失败**不算** webhook 失败：通知里的套餐名只是运营参考，不值得让 Stripe
 * 为此重投一整条事件。
 */
async function planNameForPrice(priceId: string | undefined): Promise<string | undefined> {
  if (!priceId) return undefined
  try {
    const { findPlanIdByPriceId } = await import('@/payment/price-catalog.server')
    const planId = await findPlanIdByPriceId(priceId)
    if (!planId) return undefined
    return getPricingPlans().find((plan) => plan.id === planId)?.name
  } catch {
    return undefined
  }
}

/**
 * Handles `checkout.session.completed`.
 *
 * 一次性支付没有 subscription id，必须单独写 `payments` 行，否则无法判断谁买断。
 * userId 取自 checkout metadata；用户已注销时跳过，不写孤儿行。
 */
export async function handleCheckoutCompleted(
  db: ReturnType<typeof createDb>,
  event: { id: string; data: { object: unknown } },
): Promise<void> {
  const s = event.data.object as {
    id: string
    mode?: 'payment' | 'subscription' | 'setup'
    subscription?: string | null
    customer?: string | null
    amount_total?: number | null
    currency?: string | null
    metadata?: { userId?: string; planId?: string; interval?: string }
  }

  const rawUserId = s.metadata?.userId
  if (!rawUserId) {
    console.warn('[stripe-webhook] checkout.session.completed: missing userId in metadata')
    return
  }
  const userExists = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, rawUserId))
    .limit(1)
  if (userExists.length === 0) {
    console.warn(`[stripe-webhook] checkout.session.completed: userId ${rawUserId} not found in DB`)
    return
  }

  if (s.subscription) {
    await db
      .insert(schema.subscriptions)
      .values({
        id: String(s.subscription),
        userId: rawUserId,
        customerId: s.customer ?? '',
        subscriptionId: String(s.subscription),
        status: 'active',
        // 价格与周期由 subscription.created 补齐；这里留空而不是猜一个。
        priceId: '',
      })
      .onConflictDoNothing({ target: schema.subscriptions.id })
    return
  }

  // 一次性支付：没有订阅行，但必须留下归属记录，否则退款与对账都找不到用户。
  await db
    .insert(schema.payments)
    .values({
      id: `checkout_${s.id}`,
      userId: rawUserId,
      provider: 'stripe',
      type: 'one_time',
      status: 'paid',
      amount: s.amount_total ?? 0,
      currency: s.currency ?? 'usd',
      paidAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.payments.id })
}

/**
 * Handles `invoice.paid`.
 *
 * userId 先按订阅 id 反查，再退回 customerId（订阅行尚未写入时的兜底）。
 * 不读已移除的 `inv.charge`，否则 `chargeId` 恒为 null，退款永远匹配不到行。
 *
 * 两种反查都落空时**不写**这一行：`payments.user_id` 允许为 NULL，写进去的
 * 记录用户在自己的账单页永远查不到，等于静默丢钱。改为抛错让 Stripe 重投——
 * 稍后重投时 `checkout.session.completed` 很可能已把订阅行写好，归属就找得到了。
 */
export async function handleInvoicePaid(
  db: ReturnType<typeof createDb>,
  event: { id: string; data: { object: unknown } },
): Promise<void> {
  const inv = event.data.object as InvoicePaidObject

  const subscriptionId = subscriptionIdFromInvoice(inv)
  const customerId = idOf(inv.customer)

  let userId: string | null = null
  if (subscriptionId) {
    const rows = await db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subscriptionId, subscriptionId))
      .limit(1)
    userId = rows[0]?.userId ?? null
  }
  if (!userId && customerId) {
    const rows = await db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.customerId, customerId))
      .limit(1)
    userId = rows[0]?.userId ?? null
  }

  if (!userId) {
    throw new Error(
      `invoice ${inv.id ?? 'unknown'} has no matching subscription row, cannot attribute payment`,
    )
  }

  const paidAt = toDate(inv.created)

  await db
    .insert(schema.payments)
    .values({
      id: inv.id ?? `pay_${Date.now()}`,
      userId,
      provider: 'stripe',
      type: subscriptionId ? 'subscription' : 'invoice',
      invoiceId: inv.id ?? null,
      chargeId: chargeIdFromInvoice(inv),
      status: 'paid',
      amount: inv.amount_paid,
      currency: inv.currency,
      ...(paidAt ? { paidAt } : {}),
    })
    .onConflictDoNothing({ target: schema.payments.id })
}

/**
 * Handles `customer.subscription.created` / `updated`.
 *
 * 周期字段挂在 `items.data[]` 上，只取第一项：本模板不支持多项订阅。
 * 只在有值时才写 amount / currency / interval，否则中间态会用 `undefined`
 * 擦掉上一次的正确值。
 *
 * Stripe 不保证事件顺序，`customer.subscription.created` 可能早于
 * `checkout.session.completed` 到达。此时订阅行还不存在，UPDATE 影响 0 行，
 * 订阅信息就永远补不上。故行不存在时用 `metadata.userId` 补建——这个 metadata
 * 来自创建 session 时显式写入的 `subscription_data.metadata`（Stripe **不会**把
 * Checkout Session 的 metadata 自动复制到 Subscription）。
 *
 * 拿不到归属时抛错而非静默跳过：跳过会被记成「已处理」，Stripe 永不重投。
 */
export async function handleSubscriptionUpsert(
  db: ReturnType<typeof createDb>,
  sub: SubscriptionObject,
): Promise<void> {
  const item = sub.items.data[0]
  const periodStart = toDate(item?.current_period_start)
  const periodEnd = toDate(item?.current_period_end)

  // `unit_amount: null` 表示按量计费，与「不知道」同义，只接受有限数字。
  const amount =
    typeof item?.price.unit_amount === 'number' && Number.isFinite(item.price.unit_amount)
      ? item.price.unit_amount
      : undefined
  const currency = item?.price.currency?.trim() ? item.price.currency.toLowerCase() : undefined
  // 一次性 Price 没有 `recurring`，interval 留空，账单页据此显示「终身」。
  const interval = item?.price.recurring?.interval?.trim() || undefined

  const values = {
    status: sub.status as SubscriptionStatus,
    priceId: item?.price.id ?? '',
    ...(periodStart ? { currentPeriodStart: periodStart } : {}),
    ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(interval !== undefined ? { interval } : {}),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    updatedAt: new Date(),
  }

  const updated = await db
    .update(schema.subscriptions)
    .set(values)
    .where(eq(schema.subscriptions.subscriptionId, sub.id))
    .returning({ id: schema.subscriptions.id })

  if (updated.length > 0) return

  // 行不存在：只有拿得到归属才能建，`subscriptions.user_id` 是 NOT NULL。
  const userId = sub.metadata?.userId?.trim()
  if (!userId) {
    // 抛错而不是静默 return：return 会让事件被记成「已处理」，Stripe 永不重投，
    // 这条订阅的价格与周期就永远补不上——账单页只能显示一个空壳卡片。
    // 抛错会删掉事件行并返回 500，重投时 `checkout.session.completed` 很可能
    // 已经把订阅行写好，UPDATE 就落得下了。
    throw new Error(
      `[stripe-webhook] subscription ${sub.id} has no row and no metadata.userId to attribute it`,
    )
  }

  await db
    .insert(schema.subscriptions)
    .values({
      id: sub.id,
      userId,
      customerId: idOf(sub.customer),
      subscriptionId: sub.id,
      ...values,
    })
    .onConflictDoNothing({ target: schema.subscriptions.id })
}

/**
 * 支付成功后的运营通知。
 *
 * 套餐名是核心信息，否则运营无法区分月付、年付与买断。
 * 通知失败不影响 webhook 结果：`notify()` 自身吞掉异常，不阻塞重投判断。
 */
async function notifyPaymentSucceeded(params: {
  userId: string
  amount: number
  currency: string
  kind: 'subscription' | 'one_time'
  /** 定价页上的套餐名（如「专业版」）；查不到时由调用方退回 Price id。 */
  plan?: string
}): Promise<void> {
  if (!websiteConfig.notification.enabled) return
  const amount = `${(params.amount / 100).toFixed(2)} ${params.currency.toUpperCase()}`
  const title = params.kind === 'subscription' ? '新订阅付款成功' : '新一次性付款成功'
  await notify(websiteConfig.notification.provider, {
    title,
    // 套餐名缺失时退回「未知套餐」，而不是省略整段。
    message: `用户 ${params.userId} 订阅${params.plan ?? '未知套餐'}：${amount}`,
    meta: {
      userId: params.userId,
      plan: params.plan ?? '—',
      amount,
      kind: params.kind,
    },
  })
}

export const Route = createFileRoute('/api/webhooks/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getServerContext().env
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
          return new Response('not configured', { status: 503 })
        }

        const rawBody = await request.text()
        const signature = request.headers.get('stripe-signature') ?? ''
        const provider = getPaymentProvider(websiteConfig.payment.provider)

        const event = await provider.parseWebhookEvent(rawBody, signature).catch((err) => {
          console.warn(
            `[stripe-webhook] signature verify failed: ${err instanceof Error ? err.message.split('\n')[0] : 'unknown'}`,
          )
          return null
        })
        if (!event) {
          return new Response('invalid signature', { status: 400 })
        }

        const typedEvent = event as { id: string; type: string; data: { object: unknown } }
        const db = createDb(env.DB)

        const inserted = await db
          .insert(schema.webhookEvents)
          .values({
            id: typedEvent.id,
            source: 'stripe',
            type: typedEvent.type,
            payload: JSON.stringify(event),
            processedAt: null,
          })
          .onConflictDoNothing({ target: schema.webhookEvents.id })
          .returning({ id: schema.webhookEvents.id })

        if (inserted.length === 0) {
          return new Response('duplicate', { status: 200 })
        }

        try {
          switch (typedEvent.type) {
            case 'checkout.session.completed':
              await handleCheckoutCompleted(db, typedEvent)
              break
            case 'invoice.paid': {
              await handleInvoicePaid(db, typedEvent)
              // 通知放在 handler 之后：只有落库成功才告诉运营「有人付款」。
              const inv = typedEvent.data.object as InvoicePaidObject
              const subscriptionId = subscriptionIdFromInvoice(inv)
              if (subscriptionId) {
                const rows = await db
                  .select({ userId: schema.subscriptions.userId })
                  .from(schema.subscriptions)
                  .where(eq(schema.subscriptions.subscriptionId, subscriptionId))
                  .limit(1)
                if (rows[0]) {
                  // 套餐名从发票首行反查；映射里没有时退回 Price id。
                  const priceId = priceIdFromInvoice(inv)
                  await notifyPaymentSucceeded({
                    userId: rows[0].userId,
                    amount: inv.amount_paid,
                    currency: inv.currency,
                    kind: 'subscription',
                    plan: (await planNameForPrice(priceId)) ?? priceId,
                  })
                }
              }
              break
            }
            case 'customer.subscription.updated':
            case 'customer.subscription.created':
              await handleSubscriptionUpsert(db, typedEvent.data.object as SubscriptionObject)
              break
            case 'customer.subscription.deleted': {
              const sub = typedEvent.data.object as { id: string }
              await db
                .update(schema.subscriptions)
                .set({ status: 'canceled', cancelAtPeriodEnd: true, updatedAt: new Date() })
                .where(eq(schema.subscriptions.subscriptionId, sub.id))
              break
            }
            case 'charge.refunded': {
              const ch = typedEvent.data.object as { id: string }
              await db
                .update(schema.payments)
                .set({ status: 'refunded', refundedAt: new Date() })
                .where(eq(schema.payments.chargeId, ch.id))
              break
            }
            default:
              break
          }

          await db
            .update(schema.webhookEvents)
            .set({ processedAt: new Date() })
            .where(eq(schema.webhookEvents.id, typedEvent.id))

          return new Response('ok', { status: 200 })
        } catch (err) {
          // 删除事件行，让 Stripe 重投。
          await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, typedEvent.id))
          console.error(
            `[stripe-webhook] handler error: ${err instanceof Error ? err.message.split('\n')[0] : 'unknown'}`,
          )
          return new Response('handler error', { status: 500 })
        }
      },
    },
  },
})
