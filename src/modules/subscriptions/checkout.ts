import { and, eq, inArray } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'
import type { CheckoutParams, CheckoutResult, PaymentProvider } from '@/core/payment/types'
import { applyPaymentEvent } from './events'
import { createCheckoutOrder, markOrderOpen, markOrderStatus } from './orders'
import { ACTIVE_SUBSCRIPTION_STATUSES, occupiesSubscriptionSlot } from './plan-state'

type Db = DB
const RESERVATION_SECONDS = 24 * 60 * 60

export async function findCustomerId(
  db: Db,
  userId: string,
  provider: string,
): Promise<string | undefined> {
  const [subscriptions, payments] = await Promise.all([
    db
      .select({ customerId: schema.subscriptions.customerId })
      .from(schema.subscriptions)
      .where(
        and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.provider, provider)),
      ),
    db
      .select({ customerId: schema.payments.customerId })
      .from(schema.payments)
      .where(and(eq(schema.payments.userId, userId), eq(schema.payments.provider, provider))),
  ])
  return [...subscriptions, ...payments].find((row) => row.customerId)?.customerId ?? undefined
}

export async function beginCheckout(
  db: Db,
  provider: PaymentProvider,
  input: Omit<CheckoutParams, 'idempotencyKey'>,
): Promise<CheckoutResult | null> {
  const name = provider.getProviderName()
  if (input.mode === 'payment') {
    // 一次性购买每次结账都是一次独立购买意图，先落订单再请求渠道。
    const order = await createCheckoutOrder(db, {
      userId: input.userId,
      provider: name,
      productId: input.productId,
      offerId: input.offerId,
      mode: input.mode,
    })
    let result: CheckoutResult
    try {
      result = await provider.createCheckoutSession({
        ...input,
        idempotencyKey: crypto.randomUUID(),
      })
    } catch (error) {
      try {
        await markOrderStatus(db, order.id, 'failed')
      } catch {
        // 订单状态写失败不能吞掉渠道的原始错误，原始错误优先抛出。
      }
      throw error
    }
    await markOrderOpen(db, order.id, {
      sessionId: result.sessionId,
      url: result.url,
      expiresAt: result.expiresAt,
    })
    return result
  }
  const occupied = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, input.userId),
        inArray(schema.subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .limit(1)
  if (occupied.length) return null
  const now = Math.floor(Date.now() / 1000)
  // 已有预留时复用它已有的订单，不新建：重试不烧订单号，崩溃也不会留下孤儿订单。
  // D1 没有交互式事务，只能「先读后写」并用插入冲突兜住并发。
  const [current] = await db
    .select()
    .from(schema.checkoutReservations)
    .where(eq(schema.checkoutReservations.userId, input.userId))
  let inserted: Array<{ token: string }> = []
  if (current) {
    // 旧版本预留没有订单：补建一条并挂回去，后续 markOrderOpen 才能落到它。
    if (current.provider === name && !current.orderId) {
      const order = await createCheckoutOrder(db, {
        userId: input.userId,
        provider: name,
        productId: input.productId,
        offerId: input.offerId,
        mode: input.mode,
      })
      await db
        .update(schema.checkoutReservations)
        .set({ orderId: order.id })
        .where(
          and(
            eq(schema.checkoutReservations.userId, input.userId),
            eq(schema.checkoutReservations.token, current.token),
          ),
        )
    }
  } else {
    const order = await createCheckoutOrder(db, {
      userId: input.userId,
      provider: name,
      productId: input.productId,
      offerId: input.offerId,
      mode: input.mode,
    })
    inserted = await db
      .insert(schema.checkoutReservations)
      .values({
        userId: input.userId,
        orderId: order.id,
        provider: name,
        token: crypto.randomUUID(),
        productId: input.productId,
        offerId: input.offerId,
        request: JSON.stringify({ ...input, expiresAt: now + RESERVATION_SECONDS }),
        expiresAt: now + RESERVATION_SECONDS,
      })
      .onConflictDoNothing()
      .returning({ token: schema.checkoutReservations.token })
    if (!inserted.length) {
      const [winner] = await db
        .select()
        .from(schema.checkoutReservations)
        .where(eq(schema.checkoutReservations.userId, input.userId))
      if (winner?.orderId) {
        // 并发请求先建好了订单与预留：本次订单没有被引用，删掉。
        await db.delete(schema.orders).where(eq(schema.orders.id, order.id))
      } else if (winner) {
        // 并发请求留下的是没有订单的预留：把本次订单挂上去，而不是丢弃。
        await db
          .update(schema.checkoutReservations)
          .set({ orderId: order.id })
          .where(
            and(
              eq(schema.checkoutReservations.userId, input.userId),
              eq(schema.checkoutReservations.token, winner.token),
            ),
          )
      }
    }
  }
  const [reservation] = await db
    .select()
    .from(schema.checkoutReservations)
    .where(eq(schema.checkoutReservations.userId, input.userId))
  if (!reservation || reservation.provider !== name)
    throw new Error('Checkout reservation unavailable')
  // 释放预留必须先核对远端状态，本地时间过期不代表付款未完成。
  // 再查一次，覆盖检查后、预留创建前订阅已同步的竞态。
  const [active] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, input.userId),
        inArray(schema.subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .limit(1)
  if (active) return null
  if (reservation.sessionId) {
    const session = await provider.retrieveCheckoutSession(reservation.sessionId)
    if (session.status === 'complete') {
      if (!session.subscriptionId) throw new Error('Completed Checkout subscription missing')
      const subscription = await provider.retrieveSubscription(session.subscriptionId)
      if (subscription.userId !== input.userId) throw new Error('Checkout owner mismatch')
      await applyPaymentEvent(
        db,
        {
          id: `checkout-reconcile:${crypto.randomUUID()}`,
          provider: name,
          type: 'checkout.reconciled',
          created: now,
          // 远端会话已完成：带上会话 id，让付款事件链路按它找回订单并收尾，
          // 否则 webhook 丢失时订阅生效而订单会永远停在 open。
          checkoutId: reservation.sessionId,
          subscription,
        },
        () => provider.retrieveSubscription(session.subscriptionId as string),
      )
      if (occupiesSubscriptionSlot(subscription.status)) return null
    }
    if (session.status !== 'open') {
      // token 条件防止并发请求删除后来创建的新预留。
      await db
        .delete(schema.checkoutReservations)
        .where(
          and(
            eq(schema.checkoutReservations.userId, input.userId),
            eq(schema.checkoutReservations.token, reservation.token),
          ),
        )
      return beginCheckout(db, provider, input)
    }
  }
  if (
    reservation.productId !== input.productId ||
    reservation.offerId !== input.offerId ||
    (JSON.parse(reservation.request) as CheckoutParams).priceId !== input.priceId
  ) {
    throw new Error('CHECKOUT_PENDING')
  }
  if (reservation.url && reservation.sessionId)
    return {
      url: reservation.url,
      sessionId: reservation.sessionId,
      expiresAt: reservation.expiresAt,
    }
  // 崩溃重试使用同一份请求及幂等键；不能在 Stripe 已创建 session 后改请求。
  const request = JSON.parse(reservation.request) as Omit<CheckoutParams, 'idempotencyKey'>
  const result = await provider.createCheckoutSession({
    ...request,
    idempotencyKey: reservation.token,
  })
  await db
    .update(schema.checkoutReservations)
    .set({ url: result.url, sessionId: result.sessionId, expiresAt: result.expiresAt })
    .where(
      and(
        eq(schema.checkoutReservations.userId, input.userId),
        eq(schema.checkoutReservations.token, reservation.token),
      ),
    )
  if (reservation.orderId)
    await markOrderOpen(db, reservation.orderId, {
      sessionId: result.sessionId,
      url: result.url,
      expiresAt: result.expiresAt,
    })
  // 原请求结果未知时先用原幂等键恢复，再核对其是否已完成。
  if (!inserted.length) return beginCheckout(db, provider, input)
  return result
}
