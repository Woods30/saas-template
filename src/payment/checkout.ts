import { and, eq, inArray } from 'drizzle-orm'
import { type createDb, schema } from '@/db'
import { applyPaymentEvent } from './events'
import { ACTIVE_SUBSCRIPTION_STATUSES, occupiesSubscriptionSlot } from './plan-state'
import type { CheckoutParams, CheckoutResult, PaymentProvider } from './types'

type Db = ReturnType<typeof createDb>
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
  if (input.mode === 'payment')
    return provider.createCheckoutSession({ ...input, idempotencyKey: crypto.randomUUID() })
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
  const inserted = await db
    .insert(schema.checkoutReservations)
    .values({
      userId: input.userId,
      provider: name,
      token: crypto.randomUUID(),
      productId: input.productId,
      offerId: input.offerId,
      request: JSON.stringify({ ...input, expiresAt: now + RESERVATION_SECONDS }),
      expiresAt: now + RESERVATION_SECONDS,
    })
    .onConflictDoNothing()
    .returning({ token: schema.checkoutReservations.token })
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
  // 原请求结果未知时先用原幂等键恢复，再核对其是否已完成。
  if (!inserted.length) return beginCheckout(db, provider, input)
  return result
}
