import { and, eq, sql } from 'drizzle-orm'
import { findOfferByReference, findProduct } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/core/db'
import type { PaymentEvent, ProviderSubscription } from '@/core/payment/types'
import { clawbackCreditsForRefund, grantCreditsForPayment } from './credits'

type Db = DB

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
      // 直接归属优先：核销型支付没有销售引用，只能靠事件自带商品与付费方式。
      const productId = sub.productId ?? offer?.productId ?? null
      const offerId = sub.offerId ?? offer?.offerId ?? null
      const values = {
        userId,
        provider: event.provider,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: sub.status,
        priceId: sub.priceId,
        productId,
        offerId,
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
    const productId = subscription?.productId ?? payment.productId
    const offerId = subscription?.offerId ?? payment.offerId
    // 发放放在 `saved.length` 之外：支付行可能已经落库、但上一次发放失败后 webhook
    // 重试，此时 upsert 不返回行；账本自身的幂等键保证不会重复发放。
    if (payment.status === 'paid') {
      await grantCreditsForPayment(db, {
        paymentId: `${event.provider}:${payment.id}`,
        userId,
        productId: productId ?? null,
        offerId: offerId ?? null,
        at: date,
      })
    }
    if (saved.length && payment.status === 'paid' && websiteConfig.notification.enabled) {
      const plan = productId ? (findProduct(productId)?.name ?? productId) : '未知套餐'
      const digits =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency: payment.currency,
        }).resolvedOptions().maximumFractionDigits ?? 2
      const amount = `${payment.amount / 10 ** digits} ${payment.currency.toUpperCase()}`
      // 动态 import：通知渠道要读请求作用域里的 provider 注册表，
      // 而它经 `@/lib/server-context` 依赖 `node:async_hooks`——本文件被页面路由
      // 静态引入（`subscriptions/service.ts` 转出），静态 import 会把 Node 内置模块
      // 带进客户端图，浏览器里 `AsyncLocalStorage` 不可用，整站水合失败。
      const { notify } = await import('@/core/notify/service')
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
    for (const row of rows) {
      // `refund.amount` 是这笔扣款的累计退款额；本次新增的部分才是要反扣的积分基数。
      const nextRefunded = Math.min(refund.amount, row.amount)
      const delta = nextRefunded - row.refundedAmount
      const updated = await db
        .update(schema.payments)
        .set({
          refundedAmount: nextRefunded,
          refundedAt: date,
          status: sql`CASE WHEN ${schema.payments.amount} <= ${nextRefunded} THEN 'refunded' ELSE 'partially_refunded' END`,
        })
        .where(
          and(
            eq(schema.payments.id, row.id),
            sql`${schema.payments.refundedAmount} <= ${nextRefunded}`,
          ),
        )
        .returning({ id: schema.payments.id })
      if (updated.length && delta > 0 && row.userId) {
        await clawbackCreditsForRefund(db, {
          paymentId: row.id,
          userId: row.userId,
          amount: row.amount,
          deltaRefunded: delta,
          refundedTotal: nextRefunded,
          at: date,
        })
      }
    }
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
