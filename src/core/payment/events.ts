import { and, eq, sql } from 'drizzle-orm'
import { findOfferByReference, findProduct } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { type createDb, schema } from '@/db'
import { notify } from '@/notification'
import type { PaymentEvent, ProviderSubscription } from './types'

type Db = ReturnType<typeof createDb>

/** Stripe/C​​reem 等适配器共用的持久化入口；外部 payload 不进入业务判定。 */
export async function applyPaymentEvent(
  db: Db,
  event: PaymentEvent,
  refresh?: () => Promise<ProviderSubscription>,
): Promise<void> {
  const eventKey = `${event.provider}:${event.id}`
  const [existing] = await db
    .select({ processedAt: schema.webhookEvents.processedAt })
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, eventKey))
  if (existing?.processedAt) return
  const date = new Date(event.created * 1000)
  let sub = event.subscription
  if (sub) {
    let synchronized = false
    for (let attempt = 0; attempt < 5; attempt++) {
      const [previous] = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.provider, event.provider),
            eq(schema.subscriptions.subscriptionId, sub.id),
          ),
        )
        .limit(1)
      // 先读版本，再拉取真实快照；CAS 冲突必须重新拉取，不能重写缓存快照。
      if (refresh) sub = await refresh()
      const version = (previous?.snapshotVersion ?? 0) + 1
      const userId = previous?.userId ?? sub.userId
      if (!userId) throw new Error('Subscription owner missing')
      const offer = sub.reference ? findOfferByReference(sub.reference) : undefined
      const values = {
        userId,
        provider: event.provider,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: sub.status,
        priceId: sub.priceId,
        productId: offer?.productId ?? null,
        offerId: offer?.offerId ?? null,
        amount: sub.amount,
        currency: sub.currency,
        interval: sub.interval,
        intervalCount: sub.intervalCount,
        currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart * 1000) : null,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        eventCreated: Math.max(previous?.eventCreated ?? 0, event.created),
        snapshotVersion: version,
        updatedAt: new Date(),
      }
      const written = await db
        .insert(schema.subscriptions)
        .values({ id: `${event.provider}:${sub.id}`, ...values })
        .onConflictDoUpdate({
          target: [schema.subscriptions.provider, schema.subscriptions.subscriptionId],
          set: values,
          setWhere: sql`${schema.subscriptions.snapshotVersion} = ${previous?.snapshotVersion ?? 0} AND (${schema.subscriptions.status} != 'canceled' OR ${sub.status} = 'canceled') ${refresh ? sql`` : sql`AND ${schema.subscriptions.eventCreated} <= ${event.created}`}`,
        })
        .returning({ id: schema.subscriptions.id })
      if (
        written.length ||
        previous?.status === 'canceled' ||
        (!refresh && previous && previous.eventCreated > event.created)
      ) {
        synchronized = true
        break
      }
    }
    if (!synchronized) throw new Error('Subscription snapshot conflict; retry webhook')
  }
  for (const payment of event.payments ?? (event.payment ? [event.payment] : [])) {
    const [subscription] = payment.subscriptionId
      ? await db
          .select()
          .from(schema.subscriptions)
          .where(
            and(
              eq(schema.subscriptions.provider, event.provider),
              eq(schema.subscriptions.subscriptionId, payment.subscriptionId),
            ),
          )
          .limit(1)
      : []
    const userId = subscription?.userId ?? payment.userId
    if (!userId) throw new Error('Payment owner missing')
    const saved = await db
      .insert(schema.payments)
      .values({
        id: `${event.provider}:${payment.id}`,
        externalId: payment.id,
        provider: event.provider,
        userId,
        type: payment.type,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        customerId: payment.customerId,
        chargeId: payment.chargeId,
        invoiceId: payment.invoiceId,
        subscriptionId: payment.subscriptionId,
        productId: subscription?.productId ?? payment.productId,
        offerId: subscription?.offerId ?? payment.offerId,
        eventCreated: event.created,
        paidAt: payment.status === 'paid' ? date : null,
      })
      .onConflictDoUpdate({
        target: [schema.payments.provider, schema.payments.externalId],
        set: {
          status: payment.status,
          amount: payment.amount,
          paidAt: payment.status === 'paid' ? date : null,
          chargeId: payment.chargeId,
          eventCreated: event.created,
        },
        setWhere: sql`${schema.payments.eventCreated} <= ${event.created} AND ${schema.payments.refundedAmount} = 0 AND ${schema.payments.status} != 'paid'`,
      })
      .returning({ id: schema.payments.id })
    if (saved.length && payment.status === 'paid' && websiteConfig.notification.enabled) {
      const productId = subscription?.productId ?? payment.productId
      const plan = productId ? (findProduct(productId)?.name ?? productId) : '未知套餐'
      const digits =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency: payment.currency,
        }).resolvedOptions().maximumFractionDigits ?? 2
      const amount = `${payment.amount / 10 ** digits} ${payment.currency.toUpperCase()}`
      await notify(websiteConfig.notification.provider, {
        title: payment.type === 'subscription' ? '订阅付款成功' : '一次性付款成功',
        message: `用户 ${userId} 购买 ${plan}：${amount}`,
        meta: { userId, plan, amount, kind: payment.type },
      })
    }
  }
  if (event.refund) {
    const refund = event.refund
    const rows = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.provider, event.provider),
          eq(schema.payments.chargeId, refund.chargeId),
        ),
      )
    if (!rows.length) throw new Error('Refund payment not yet synchronized')
    await db
      .update(schema.payments)
      .set({
        refundedAmount: refund.amount,
        refundedAt: date,
        status: sql`CASE WHEN ${schema.payments.amount} <= ${refund.amount} THEN 'refunded' ELSE 'partially_refunded' END`,
      })
      .where(
        and(
          eq(schema.payments.provider, event.provider),
          eq(schema.payments.chargeId, refund.chargeId),
          sql`${schema.payments.refundedAmount} <= ${refund.amount}`,
        ),
      )
  }
  await db
    .insert(schema.webhookEvents)
    .values({
      id: eventKey,
      source: event.provider,
      type: event.type,
      payload: JSON.stringify(event),
      processedAt: new Date(),
    })
    .onConflictDoUpdate({ target: schema.webhookEvents.id, set: { processedAt: new Date() } })
}
