/**
 * 核销订单的人工核验与结算。
 *
 * 核销链路不接支付渠道：管理员核验通过后，这里合成一条 `provider='collection'`
 * 的付款事件，交给既有的 `applyPaymentEvent` 落库。事件 ID 固定为
 * `order:{orderId}:settled`，付款外部 ID 是订单号；幂等由事件幂等表保证 ——
 * 崩溃重试不会写第二条付款记录。
 *
 * 三条硬规则贯穿本文件：
 *
 * - **只有核验能写资金事实**：用户申报不写付款，核验才写；
 * - **普通核验金额必须相等**：不相等只能走异常核验，且必须写理由；
 * - **续期不重复计算**：崩溃重试时先读库里已有的周期，再决定从哪续。
 */

import { and, eq, ne } from 'drizzle-orm'
import { isUniqueConstraintError, toCollectionOrder } from '@/collection/orders'
import {
  CollectionError,
  type CollectionOrder,
  type CollectionReview,
  type ReviewOrderInput,
} from '@/collection/types'
import { type DB, schema } from '@/db'
import { applyPaymentEvent } from '@/payment/events'
import { occupiesSubscriptionSlot } from '@/payment/plan-state'
import type { PaymentEvent } from '@/payment/types'

/** 核销结算在支付层里的 provider 标识。 */
export const COLLECTION_PROVIDER = 'collection'

/** 结算事件的类型标记。 */
export const COLLECTION_SETTLEMENT_EVENT_TYPE = 'collection.settled'

type OrderRow = typeof schema.collectionOrders.$inferSelect

/** 结算事件的固定 ID：同一订单的结算事件只有一条。 */
export function collectionSettlementEventId(orderId: string): string {
  return `order:${orderId}:settled`
}

/** 核销型订阅的稳定外部 ID：同一账号只有一条核销订阅。 */
export function collectionSubscriptionId(userId: string): string {
  return `user:${userId}`
}

/**
 * 按 UTC 日历增加订阅周期，保留「月末夹紧」语义。
 *
 * 1 月 31 日加一个月落在 2 月末（闰年是 2 月 29 日），加一年则 2 月 29 日
 * 落到 2 月 28 日。时刻部分原样保留，周期边界才是准的。
 */
export function addBillingInterval(start: Date, interval: 'month' | 'year', count: number): Date {
  const steps = Math.max(1, Math.trunc(count))
  const targetYear = interval === 'year' ? start.getUTCFullYear() + steps : start.getUTCFullYear()
  const targetMonth = interval === 'year' ? start.getUTCMonth() : start.getUTCMonth() + steps
  // Date.UTC 会自动把越界的月份进位到下一年。
  const firstOfTarget = new Date(Date.UTC(targetYear, targetMonth, 1))
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const day = Math.min(start.getUTCDate(), lastDay)
  return new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth(),
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  )
}

/**
 * 管理员核验一笔订单。
 *
 * 普通通过要求订单处于待核验且金额相等；异常通过额外接受已过期但钱已到账的
 * 订单，但必须写理由；驳回不产生任何资金事实。
 *
 * 幂等：同一笔核验重复提交只会结算一次。结算中途崩溃后订单停在 `settling`，
 * 重试会沿用订单上已落库的核验数据继续完成，不会写第二条付款、也不会重复续期。
 */
export async function reviewOrder(
  db: DB,
  input: ReviewOrderInput,
  now: Date = new Date(),
): Promise<CollectionOrder> {
  const at = truncateToSecond(now)
  const order = await readOrder(db, input.orderId)
  if (!order) {
    throw new CollectionError('ORDER_NOT_FOUND', '订单不存在')
  }

  if (input.action === 'reject') {
    return rejectOrder(db, order, input, at)
  }

  // 终态重复提交直接返回：同一笔核验不产生第二条付款记录。
  if (order.status === 'settled' || order.status === 'requires_refund') {
    return toCollectionOrder(order)
  }
  if (order.status === 'settling') {
    // 崩溃重试：沿用订单上已落库的核验数据，续期不会被重复计算。
    return settleCollectionOrder(db, toCollectionOrder(order), reviewFromOrder(order), at)
  }
  if (
    order.status !== 'pending_verification' &&
    !(input.action === 'approve_exception' && order.status === 'expired')
  ) {
    throw new CollectionError('INVALID_ORDER_STATE', `订单当前状态为 ${order.status}，不允许核验`)
  }

  const review = normalizeReview(input, order, at)
  const locked = await lockOrder(db, order, review, at)
  return settleCollectionOrder(db, locked, review, at)
}

/**
 * 把已核验的订单落成资金事实。
 *
 * 顺序固定：先检查订阅冲突（有冲突就转需退款，不授予权益），再调用
 * `applyPaymentEvent` 落库，最后把订单标记为已结算并清理同账号的重复订阅订单。
 */
export async function settleCollectionOrder(
  db: DB,
  order: CollectionOrder,
  review: CollectionReview,
  now: Date = new Date(),
): Promise<CollectionOrder> {
  const at = truncateToSecond(now)
  const amount = review.observedAmount ?? order.observedAmount ?? order.payableAmount
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CollectionError('AMOUNT_MISMATCH', '缺少有效的实际到账金额')
  }

  let period: BillingPeriod | null = null
  if (order.kind === 'subscription') {
    const conflict = await detectSubscriptionConflict(db, order)
    if (conflict) {
      return markRequiresRefund(db, order, review, amount, conflict, at)
    }
    period = await resolveSubscriptionPeriod(db, order, review.reviewedAt)
  }

  await applyPaymentEvent(db, buildSettlementEvent(order, review, amount, period))

  const settled = await markSettled(db, order, at)
  if (order.kind === 'subscription') {
    await cleanupDuplicateOrders(db, order, at)
  }
  return settled
}

/** 订阅周期的一段。 */
interface BillingPeriod {
  start: Date
  end: Date
}

/** 驳回订单：不写付款，也不写订阅。 */
async function rejectOrder(
  db: DB,
  order: OrderRow,
  input: ReviewOrderInput,
  at: Date,
): Promise<CollectionOrder> {
  if (order.status === 'rejected') return toCollectionOrder(order)
  if (order.status !== 'pending_verification') {
    throw new CollectionError('INVALID_ORDER_STATE', `订单当前状态为 ${order.status}，不允许驳回`)
  }
  const updated = await db
    .update(schema.collectionOrders)
    .set({
      status: 'rejected',
      reviewNote: normalizeText(input.reviewNote),
      observedAmount: normalizeAmount(input.observedAmount),
      externalReference: normalizeText(input.externalReference),
      reviewedBy: input.reviewerId,
      reviewedAt: at,
      updatedAt: at,
    })
    .where(
      and(
        eq(schema.collectionOrders.id, order.id),
        eq(schema.collectionOrders.status, 'pending_verification'),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) {
    const fresh = await readOrder(db, order.id)
    if (fresh?.status === 'rejected') return toCollectionOrder(fresh)
    throw new CollectionError('INVALID_ORDER_STATE', '订单状态已变化，驳回失败')
  }
  return toCollectionOrder(row)
}

/**
 * 取结算锁：把订单 CAS 到 `settling`。
 *
 * 条件里带当前状态，更新不到行说明订单已被别人处理；唯一索引冲突说明同一账号
 * 已有订单在结算中。
 */
async function lockOrder(
  db: DB,
  order: OrderRow,
  review: CollectionReview,
  at: Date,
): Promise<CollectionOrder> {
  try {
    const updated = await db
      .update(schema.collectionOrders)
      .set({
        status: 'settling',
        observedAmount: review.observedAmount,
        reviewNote: review.reviewNote,
        externalReference: review.externalReference,
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt,
        updatedAt: at,
      })
      .where(
        and(
          eq(schema.collectionOrders.id, order.id),
          eq(schema.collectionOrders.status, order.status),
        ),
      )
      .returning()
    const row = updated[0]
    if (!row) {
      throw new CollectionError('SETTLEMENT_IN_PROGRESS', '订单状态已变化，无法进入结算')
    }
    return toCollectionOrder(row)
  } catch (error) {
    if (error instanceof CollectionError) throw error
    if (isUniqueConstraintError(error)) {
      if (mentionsColumn(error, 'user_id')) {
        throw new CollectionError('SETTLEMENT_IN_PROGRESS', '该账号已有订单正在结算')
      }
      throw new CollectionError(
        'INVALID_ORDER_STATE',
        '该订单的应付金额已被其它活跃订单占用，无法结算',
      )
    }
    throw error
  }
}

/** 校验核验输入，返回规范化的核验结果。 */
function normalizeReview(input: ReviewOrderInput, order: OrderRow, at: Date): CollectionReview {
  const observedAmount = normalizeAmount(input.observedAmount)
  const reviewNote = normalizeText(input.reviewNote)
  if (input.action === 'approve') {
    if (observedAmount === null) {
      throw new CollectionError('AMOUNT_MISMATCH', '必须填写实际到账金额')
    }
    if (observedAmount !== order.payableAmount) {
      throw new CollectionError(
        'AMOUNT_MISMATCH',
        `实际到账金额 ${observedAmount} 与应付金额 ${order.payableAmount} 不一致`,
      )
    }
  } else {
    if (!reviewNote) {
      throw new CollectionError('INVALID_REVIEW_NOTE', '异常核验必须填写理由')
    }
    if (observedAmount === null) {
      throw new CollectionError('AMOUNT_MISMATCH', '异常核验必须填写实际到账金额')
    }
  }
  return {
    action: input.action,
    observedAmount,
    reviewNote,
    externalReference: normalizeText(input.externalReference),
    reviewedBy: input.reviewerId,
    reviewedAt: at,
  }
}

/** 从订单上读回已落库的核验数据（崩溃重试时沿用，不重新计算）。 */
function reviewFromOrder(order: OrderRow): CollectionReview {
  return {
    action: 'approve',
    observedAmount: order.observedAmount,
    reviewNote: order.reviewNote,
    externalReference: order.externalReference,
    reviewedBy: order.reviewedBy ?? '',
    reviewedAt: order.reviewedAt ?? order.updatedAt,
  }
}

/**
 * 检查账号是否已有不兼容的占位订阅。
 *
 * 有其它渠道的生效订阅、或有不同商品 / 付费方式的核销订阅时，钱虽然到了账，
 * 但不能再授予一份订阅 —— 订单转需退款，由人工退款。
 */
async function detectSubscriptionConflict(db: DB, order: CollectionOrder): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, order.userId))
  const ownId = collectionSubscriptionId(order.userId)
  const own = rows.find(
    (row) => row.provider === COLLECTION_PROVIDER && row.subscriptionId === ownId,
  )
  const foreign = rows.find((row) => row.id !== own?.id && occupiesSubscriptionSlot(row.status))
  if (foreign) {
    return `账号已有其它渠道的生效订阅（${foreign.provider}），无法再授予核销订阅`
  }
  if (own) {
    if (own.status === 'canceled') {
      return '账号已有已取消的核销订阅记录，需要人工处理'
    }
    if (own.productId !== order.productId || own.offerId !== order.offerId) {
      return '账号已有其它商品或付费方式的核销订阅，无法再授予核销订阅'
    }
  }
  return null
}

/**
 * 计算本次结算的订阅周期。
 *
 * - 没有当前订阅：从核验时间起算；
 * - 有同一商品 + offer 的核销订阅：从「核验时间与当前周期结束时间的较晚者」顺延。
 *
 * 崩溃重试时**不能**再按「核验时间加一个月」重算：库里已有的周期可能就是这次
 * 结算写进去的。判断办法是看已存周期的起点是否已经在核验时间之后、且长度正好
 * 是一个订阅周期 —— 满足就说明这次续期已经落库，直接沿用。
 */
async function resolveSubscriptionPeriod(
  db: DB,
  order: CollectionOrder,
  reviewedAt: Date,
): Promise<BillingPeriod> {
  const interval = order.interval ?? 'month'
  const count = order.intervalCount ?? 1
  const [own] = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.provider, COLLECTION_PROVIDER),
        eq(schema.subscriptions.subscriptionId, collectionSubscriptionId(order.userId)),
      ),
    )
    .limit(1)

  if (!own) {
    const start = new Date(reviewedAt)
    return { start, end: addBillingInterval(start, interval, count) }
  }

  const existingStart = own.currentPeriodStart?.getTime() ?? null
  const existingEnd = own.currentPeriodEnd?.getTime() ?? null
  if (
    existingStart !== null &&
    existingEnd !== null &&
    existingStart >= reviewedAt.getTime() &&
    existingEnd === addBillingInterval(new Date(existingStart), interval, count).getTime()
  ) {
    return { start: new Date(existingStart), end: new Date(existingEnd) }
  }

  const base = Math.max(reviewedAt.getTime(), existingEnd ?? reviewedAt.getTime())
  const start = new Date(base)
  return { start, end: addBillingInterval(start, interval, count) }
}

/**
 * 合成结算事件。
 *
 * 事件 ID 与付款外部 ID 都固定：同一订单的结算事件只有一条，重复提交由事件
 * 幂等表挡住。事件的 `created` 用核验时刻，崩溃重试时事件内容完全一致。
 */
function buildSettlementEvent(
  order: CollectionOrder,
  review: CollectionReview,
  amount: number,
  period: BillingPeriod | null,
): PaymentEvent {
  const isSubscription = order.kind === 'subscription'
  const subscriptionId = isSubscription ? collectionSubscriptionId(order.userId) : null
  const event: PaymentEvent = {
    id: collectionSettlementEventId(order.id),
    provider: COLLECTION_PROVIDER,
    type: COLLECTION_SETTLEMENT_EVENT_TYPE,
    created: Math.floor(review.reviewedAt.getTime() / 1000),
    payment: {
      id: order.id,
      invoiceId: null,
      // 核销不是卡支付，没有渠道单号。
      chargeId: null,
      customerId: null,
      userId: order.userId,
      productId: order.productId,
      offerId: order.offerId,
      subscriptionId,
      type: isSubscription ? 'subscription' : 'one_time',
      amount,
      currency: order.currency,
      status: 'paid',
    },
  }
  if (isSubscription && period && subscriptionId) {
    event.subscriptionId = subscriptionId
    event.subscription = {
      id: subscriptionId,
      userId: order.userId,
      customerId: null,
      priceId: '',
      // 核销没有销售引用，归属靠事件自带的商品与付费方式。
      reference: null,
      productId: order.productId,
      offerId: order.offerId,
      amount,
      currency: order.currency,
      interval: order.interval,
      intervalCount: order.intervalCount,
      currentPeriodStart: Math.floor(period.start.getTime() / 1000),
      currentPeriodEnd: Math.floor(period.end.getTime() / 1000),
      cancelAtPeriodEnd: false,
      status: 'active',
    }
  }
  return event
}

/** 把订单标记为已结算。 */
async function markSettled(db: DB, order: CollectionOrder, at: Date): Promise<CollectionOrder> {
  const updated = await db
    .update(schema.collectionOrders)
    .set({ status: 'settled', settledAt: at, updatedAt: at })
    .where(
      and(eq(schema.collectionOrders.id, order.id), eq(schema.collectionOrders.status, 'settling')),
    )
    .returning()
  const row = updated[0]
  if (row) return toCollectionOrder(row)
  const fresh = await readOrder(db, order.id)
  if (fresh?.status === 'settled') return toCollectionOrder(fresh)
  throw new CollectionError(
    'INVALID_ORDER_STATE',
    `订单当前状态为 ${fresh?.status ?? '未知'}，无法标记为已结算`,
  )
}

/**
 * 标记为需退款：钱已到账但不能授予权益，退款由人工完成。
 *
 * 不写新的有效订阅，也不写付款记录 —— 订单本身就是这笔钱的唯一凭据。
 */
async function markRequiresRefund(
  db: DB,
  order: CollectionOrder,
  review: CollectionReview,
  amount: number,
  reason: string,
  at: Date,
): Promise<CollectionOrder> {
  const note = [review.reviewNote, reason].filter((part) => Boolean(part)).join('；')
  const updated = await db
    .update(schema.collectionOrders)
    .set({
      status: 'requires_refund',
      observedAmount: amount,
      reviewNote: note,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt,
      updatedAt: at,
    })
    .where(
      and(eq(schema.collectionOrders.id, order.id), eq(schema.collectionOrders.status, 'settling')),
    )
    .returning()
  const row = updated[0]
  if (row) return toCollectionOrder(row)
  const fresh = await readOrder(db, order.id)
  if (fresh?.status === 'requires_refund') return toCollectionOrder(fresh)
  throw new CollectionError('INVALID_ORDER_STATE', '订单状态已变化，无法标记为需退款')
}

/**
 * 结算成功后清理同账号的其它订阅订单。
 *
 * 还在待支付的直接取消（用户下了一单新的，旧单作废）；已在待核验的重复单转
 * 需退款 —— 同一账号只能有一份订阅权益。
 */
async function cleanupDuplicateOrders(db: DB, order: CollectionOrder, at: Date): Promise<void> {
  await db
    .update(schema.collectionOrders)
    .set({ status: 'canceled', updatedAt: at })
    .where(
      and(
        eq(schema.collectionOrders.userId, order.userId),
        ne(schema.collectionOrders.id, order.id),
        eq(schema.collectionOrders.kind, 'subscription'),
        eq(schema.collectionOrders.status, 'pending_payment'),
      ),
    )
  await db
    .update(schema.collectionOrders)
    .set({ status: 'requires_refund', updatedAt: at })
    .where(
      and(
        eq(schema.collectionOrders.userId, order.userId),
        ne(schema.collectionOrders.id, order.id),
        eq(schema.collectionOrders.kind, 'subscription'),
        eq(schema.collectionOrders.status, 'pending_verification'),
      ),
    )
}

/** 按 ID 读取订单（管理员视角，不做归属隔离）。 */
async function readOrder(db: DB, orderId: string): Promise<OrderRow | undefined> {
  const rows = await db
    .select()
    .from(schema.collectionOrders)
    .where(eq(schema.collectionOrders.id, orderId))
    .limit(1)
  return rows[0]
}

/** 规范化金额：必须是正整数（单位：分），否则按未填处理。 */
function normalizeAmount(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null
  if (!Number.isInteger(amount) || amount <= 0) return null
  return amount
}

/** 规范化文本：去首尾空白，空值视为未填。 */
function normalizeText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * 时间戳对齐到秒。
 *
 * D1 的 timestamp 列存整数秒，核验时刻如果带毫秒，读回来就对不上，续期判断
 * 会失准。
 */
function truncateToSecond(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000)
}

/** 唯一约束错误里是否提到了指定列。 */
function mentionsColumn(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { message?: unknown; cause?: unknown }
  if (typeof candidate.message === 'string' && candidate.message.includes(column)) return true
  if (candidate.cause && candidate.cause !== error) return mentionsColumn(candidate.cause, column)
  return false
}
