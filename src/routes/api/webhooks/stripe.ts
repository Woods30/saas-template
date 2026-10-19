import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getServerContext } from '@/lib/server-context'
import { notify } from '@/notification'
import { getPaymentProvider } from '@/payment'
import type { SubscriptionStatus } from '@/payment/types'

/**
 * Stripe webhook 路由 — 幂等 + 重投保护。
 *
 * 幂等表 `webhook_events` 在 Task 2 schema 已声明：
 * - `id`: Stripe event id（`evt_xxx`），主键
 * - `type`: 事件类型
 * - `payload`: 原始 JSON（用于排障）
 * - `processedAt`: 处理完成时间（NULL = 在处理中）
 *
 * 流程：
 * 1. 验签失败 → 400（不写库）
 * 2. INSERT OR IGNORE event id；已存在 → 直接 200
 * 3. 业务 switch；任意抛错 → 500（让 Stripe 重投）
 * 4. 成功后 UPDATE `processedAt = now()`
 *
 * ## Stripe API 版本（重要）
 *
 * `stripe@23` 对应 API `2025-09-30.clover`，与旧版本相比有两处**破坏性字段迁移**，
 * 本文件的 handler 已按新结构读取：
 *
 * - `Invoice.subscription` → `Invoice.parent.subscription_details.subscription`
 * - `Invoice.charge` → `Invoice.payments.data[].payment.charge`（或 `payment_intent`）
 * - `Subscription.current_period_start` / `current_period_end` →
 *   `Subscription.items.data[].current_period_*`（周期属于订阅项，不再挂在订阅上）
 *
 * 按旧字段读取不会抛错——字段是 `undefined`，于是 `payments.type` 恒为 `'invoice'`、
 * `stripeChargeId` 恒为 `null`、周期写成 `Invalid Date`。这正是「配置完整、功能静默
 * 错误」的典型：webhook 返回 200，数据库里却是错数据。
 */

// ------------------------------------------------------------------------------------------------
// 类型辅助 —— 只声明实际读取的字段，避免把整个 Stripe 类型搬进业务层
// ------------------------------------------------------------------------------------------------

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
}

/** `customer.subscription.*` 事件中实际用到的字段。 */
interface SubscriptionObject {
  id: string
  status: string
  cancel_at_period_end?: boolean
  items: {
    data: Array<{
      price: { id: string }
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
 * 从 Invoice 中取 charge id。
 *
 * 新 API 把支付记录放在 `invoice.payments.data[]`，`payment.charge` 只在**没有**
 * PaymentIntent 时才直接给出 charge（有 PI 时给的是 `payment_intent`）。这里优先
 * 取 charge，取不到时退回 payment_intent id——`charge.refunded` 分支按 `chargeId`
 * 回写，用 PI id 做键对不上，但至少比写入 `null` 可排障（有值说明「这是 PI 支付」）。
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

// ------------------------------------------------------------------------------------------------
// 业务 handler
// ------------------------------------------------------------------------------------------------

/**
 * Handles `checkout.session.completed`.
 *
 * - 订阅模式：写入 `subscriptions` 行。真实周期 / 价格由随后的
 *   `customer.subscription.created` 补齐，这里只落 userId 与 customerId 的关联。
 * - 一次性支付（`mode: 'payment'`，如终身版）：**没有** subscription id。
 *   旧实现直接跳过，导致 `payments.userId` 永远为 null、无法判断谁买了终身版。
 *   这里改为写一条 `payments` 行，userId 取自 checkout 的 metadata。
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
    metadata?: { userId?: string }
  }

  const rawUserId = s.metadata?.userId
  if (!rawUserId) {
    console.warn('[stripe-webhook] checkout.session.completed: missing userId in metadata')
    return
  }
  // 先确认用户仍在库中：用户注销后到达的迟到事件不应写入孤儿行。
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
 * userId 的查找顺序：
 * 1. 按 invoice 的订阅 id 反查 `subscriptions`（最准，订阅行一定存在）；
 * 2. 退回按 customerId 反查（订阅行尚未写入时的兜底）。
 *
 * 旧实现只走 2，且读的是新 API 已移除的 `inv.charge`，于是 `chargeId` 恒为 null、
 * `charge.refunded` 永远匹配不到任何行。
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
 * 周期字段在 `items.data[]` 上（新 API），取**第一项**作为订阅的主周期：本模板的
 * 定价模型是单价格订阅，多项订阅（按量 + 席位）不在支持范围内。
 */
export async function handleSubscriptionUpsert(
  db: ReturnType<typeof createDb>,
  sub: SubscriptionObject,
): Promise<void> {
  const item = sub.items.data[0]
  const periodStart = toDate(item?.current_period_start)
  const periodEnd = toDate(item?.current_period_end)

  await db
    .update(schema.subscriptions)
    .set({
      status: sub.status as SubscriptionStatus,
      priceId: item?.price.id ?? '',
      ...(periodStart ? { currentPeriodStart: periodStart } : {}),
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.subscriptionId, sub.id))
}

// ------------------------------------------------------------------------------------------------
// 通知
// ------------------------------------------------------------------------------------------------

/**
 * 支付成功后的运营通知。
 *
 * tanstarter 把「支付成功」作为通知模块的主要触发点；本模板此前只在联系表单里
 * 调用 `notify()`，支付事件完全没有通知，运营侧要等到查数据库才知道有人付款。
 *
 * 通知**不阻塞** webhook：`notify()` 自身吞掉所有异常并返回 `false`，这里也不
 * await 失败——webhook 的返回值只决定 Stripe 是否重投，与通知成败无关。
 */
async function notifyPaymentSucceeded(params: {
  userId: string
  amount: number
  currency: string
  kind: 'subscription' | 'one_time'
}): Promise<void> {
  if (!websiteConfig.notification.enabled) return
  const amount = `${(params.amount / 100).toFixed(2)} ${params.currency.toUpperCase()}`
  await notify(websiteConfig.notification.provider, {
    title: params.kind === 'subscription' ? '新订阅付款成功' : '新一次性付款成功',
    message: `用户 ${params.userId} 完成付款：${amount}`,
    meta: { userId: params.userId, amount, kind: params.kind },
  })
}

// ------------------------------------------------------------------------------------------------
// Route
// ------------------------------------------------------------------------------------------------

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

        // 幂等：先尝试插入
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
                  await notifyPaymentSucceeded({
                    userId: rows[0].userId,
                    amount: inv.amount_paid,
                    currency: inv.currency,
                    kind: 'subscription',
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
          // 业务失败：删除已插入的事件行，让 Stripe 重投
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
