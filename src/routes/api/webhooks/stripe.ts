import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getServerContext } from '@/lib/server-context'
import { getPaymentProvider } from '@/payment'

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
 */

// ------------------------------------------------------------------------------------------------
// Exported handlers — extracted for unit-test coverage of Fix 3, 4, 5
// ------------------------------------------------------------------------------------------------

/**
 * Handles checkout.session.completed event.
 * Fix 3: Validates userId in metadata exists before INSERT.
 * Fix 5: Skips INSERT when subscription id is absent (customer.subscription.created is source of truth).
 */
export async function handleCheckoutCompleted(
  db: ReturnType<typeof createDb>,
  event: { id: string; data: { object: unknown } },
): Promise<void> {
  const s = event.data.object as {
    id: string
    subscription?: string
    customer?: string
    metadata?: { userId?: string }
  }

  // Fix 5: If no subscription id, skip INSERT
  if (!s.subscription) {
    console.warn('[stripe-webhook] checkout.session.completed: no subscription id, skipping INSERT')
    return
  }

  // Fix 3: Validate userId in metadata exists in DB before INSERT
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

  await db
    .insert(schema.subscriptions)
    .values({
      id: String(s.subscription),
      userId: rawUserId,
      customerId: String(s.customer ?? ''),
      subscriptionId: String(s.subscription),
      status: 'active',
      priceId: '',
    })
    .onConflictDoNothing({ target: schema.subscriptions.id })
}

/**
 * Handles invoice.paid event.
 * Fix 4: Persists stripeChargeId and looks up userId from subscriptions via customerId.
 */
export async function handleInvoicePaid(
  db: ReturnType<typeof createDb>,
  event: { id: string; data: { object: unknown } },
): Promise<void> {
  const inv = event.data.object as {
    id?: string
    subscription?: string
    customer?: string
    charge?: string | null
    amount_paid: number
    currency: string
    created: number
  }

  // Fix 4: Look up userId via subscriptions matching customerId
  let userId: string | null = null
  if (inv.customer) {
    const subRows = await db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.customerId, inv.customer))
      .limit(1)
    if (subRows[0]) {
      userId = subRows[0].userId
    }
  }

  await db
    .insert(schema.payments)
    .values({
      id: inv.id ?? `pay_${Date.now()}`,
      userId,
      type: inv.subscription ? 'subscription' : 'invoice',
      stripeInvoiceId: inv.id ?? null,
      stripeChargeId: inv.charge ?? null,
      status: 'paid',
      amount: inv.amount_paid,
      currency: inv.currency,
      paidAt: new Date(inv.created * 1000),
    })
    .onConflictDoNothing({ target: schema.payments.id })
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
            case 'invoice.paid':
              await handleInvoicePaid(db, typedEvent)
              break
            case 'customer.subscription.updated':
            case 'customer.subscription.created': {
              const sub = typedEvent.data.object as {
                id: string
                status: string
                items: { data: Array<{ price: { id: string } }> }
                current_period_start: number
                current_period_end: number
                cancel_at_period_end: boolean
              }
              await db
                .update(schema.subscriptions)
                .set({
                  status: sub.status as
                    | 'active'
                    | 'canceled'
                    | 'incomplete'
                    | 'incomplete_expired'
                    | 'past_due'
                    | 'paused'
                    | 'trialing'
                    | 'unpaid',
                  priceId: sub.items.data[0]?.price.id ?? '',
                  currentPeriodStart: new Date(sub.current_period_start * 1000),
                  currentPeriodEnd: new Date(sub.current_period_end * 1000),
                  cancelAtPeriodEnd: sub.cancel_at_period_end,
                })
                .where(eq(schema.subscriptions.subscriptionId, sub.id))
              break
            }
            case 'customer.subscription.deleted': {
              const sub = typedEvent.data.object as { id: string }
              await db
                .update(schema.subscriptions)
                .set({ status: 'canceled', cancelAtPeriodEnd: true })
                .where(eq(schema.subscriptions.subscriptionId, sub.id))
              break
            }
            case 'charge.refunded': {
              const ch = typedEvent.data.object as { id: string }
              await db
                .update(schema.payments)
                .set({ status: 'refunded', refundedAt: new Date() })
                .where(eq(schema.payments.stripeChargeId, ch.id))
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
