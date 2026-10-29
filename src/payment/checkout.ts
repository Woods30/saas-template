import { and, eq, inArray, lt } from 'drizzle-orm'
import { type createDb, schema } from '@/db'
import { ACTIVE_SUBSCRIPTION_STATUSES } from './plan-state'
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
  await db
    .delete(schema.checkoutReservations)
    .where(
      and(
        eq(schema.checkoutReservations.userId, input.userId),
        lt(schema.checkoutReservations.expiresAt, now),
      ),
    )
  await db
    .insert(schema.checkoutReservations)
    .values({
      userId: input.userId,
      provider: name,
      token: crypto.randomUUID(),
      productId: input.productId,
      offerId: input.offerId,
      request: JSON.stringify(input),
      expiresAt: now + RESERVATION_SECONDS,
    })
    .onConflictDoNothing()
  const [reservation] = await db
    .select()
    .from(schema.checkoutReservations)
    .where(eq(schema.checkoutReservations.userId, input.userId))
  if (!reservation || reservation.provider !== name)
    throw new Error('Checkout reservation unavailable')
  // 预留始终保留到会话过期，旧 Webhook 无权释放新会话。
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
  return result
}
