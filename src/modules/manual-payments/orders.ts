/**
 * 核销订单：惰性过期与并发安全的应付金额分配，以及用户侧的状态机。
 *
 * 一笔核销订单由两行组成：
 *
 * - `orders`：购买意图（订单号、用户、provider、商品 / 付费方式、状态）；
 * - `manual_payment_details`：核销专有字段（收款账户、金额尾数、凭证与核验状态）。
 *
 * 应付金额 = 标价 + 尾数，尾数取 1–99 分。同一收款账户下，活跃订单的应付金额
 * 必须全局唯一 —— 人工对着账单要能一眼分清哪笔钱对应哪张订单。
 *
 * 唯一性由 `manual_payment_details` 的 partial unique index 兜底，**不采用
 * 「先查空位再插入」**：那样并发请求会同时选中同一个尾数。这里只做随机起点 +
 * 环形扫描，每次都真的 INSERT，让唯一索引来判定谁赢了。
 *
 * 状态机：`pending_payment → pending_verification → settling → settled`，旁路是
 * `expired`、`canceled`、`rejected`、`requires_refund`。订单状态与核销状态同步：
 * 过期 / 取消 / 驳回 / 结算都会回写 `orders.status`，只描述结账尝试的终态。
 *
 * 两条硬规则贯穿本文件：
 *
 * - **越权统一表现为订单不存在**：别人的订单读不到、改不了，也不泄漏它是否存在；
 * - **每次状态更新都带当前状态与所有者作为条件**（CAS 语义）：更新不到行就重新
 *   读取，再映射成稳定的错误码，绝不「先查再无条件 UPDATE」。
 */

import { and, count, desc, eq, gt, inArray, lte } from 'drizzle-orm'
import { resolveManualPaymentPrice } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/core/db'
import { newOrderNo, type OrderStatus } from '@/modules/subscriptions/service'
import { resolveManualPaymentAccount } from './accounts'
import {
  type CancelOrderInput,
  type ListUserOrdersInput,
  MANUAL_PAYMENT_PAYER_NOTE_MAX_LENGTH,
  MANUAL_PAYMENT_PROVIDER,
  ManualPaymentError,
  type ManualPaymentOrder,
  type ManualPaymentOrderStatus,
  type ManualPaymentPrice,
  type ResolvedManualPaymentAccount,
  type SubmitOrderInput,
  type UserOrderPage,
} from './types'

/** 订单有效期：精确 15 分钟。 */
export const MANUAL_PAYMENT_ORDER_TTL_SECONDS = 15 * 60
/** 尾数下界。 */
export const FINGERPRINT_MIN = 1
/** 尾数上界。 */
export const FINGERPRINT_MAX = 99

const FINGERPRINT_SPAN = FINGERPRINT_MAX - FINGERPRINT_MIN + 1

type OrderRow = typeof schema.orders.$inferSelect
type DetailRow = typeof schema.manualPaymentDetails.$inferSelect

/** 联表读取后重新组合出的两行。 */
export interface OrderRecord {
  order: OrderRow
  detail: DetailRow
}

/**
 * 两张表分两次读取再在内存里组合。
 *
 * 不用 JOIN 一次取全：sqlite-proxy 按列位置回填结果，而两张表有同名列
 * （`user_id`、`status`、`expires_at`、`created_at`、`updated_at`），JOIN 的
 * 结果对象会按列名去重，后面的字段全部错位。单表查询没有这个问题。
 */
export async function readOrderRecordById(
  db: DB,
  orderId: string,
  userId?: string,
): Promise<OrderRecord | undefined> {
  const orderFilter =
    userId === undefined
      ? eq(schema.orders.id, orderId)
      : and(eq(schema.orders.id, orderId), eq(schema.orders.userId, userId))
  const orders = await db.select().from(schema.orders).where(orderFilter).limit(1)
  const order = orders[0]
  if (!order) return undefined
  const details = await db
    .select()
    .from(schema.manualPaymentDetails)
    .where(eq(schema.manualPaymentDetails.orderId, order.id))
    .limit(1)
  const detail = details[0]
  if (!detail) return undefined
  return { order, detail }
}

/** 批量读取订单的核销详情，按 `orderId` 建索引。 */
async function readDetailsByOrderIds(db: DB, orderIds: string[]): Promise<Map<string, DetailRow>> {
  if (orderIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(schema.manualPaymentDetails)
    .where(inArray(schema.manualPaymentDetails.orderId, orderIds))
  return new Map(rows.map((row) => [row.orderId, row]))
}

/** 创建订单的输入。 */
export interface CreateOrderInput {
  userId: string
  productId: string
  offerId: string
}

/**
 * 核销状态 → 订单状态。
 *
 * `orders.status` 只描述结账尝试：进行中的都算 `open`，钱到账是 `completed`，
 * 过期 / 取消 / 失败各归各的终态。驳回与需退款都属于「这次结账没成」，
 * 统一落到 `failed`。
 */
const ORDER_STATUS_BY_DETAIL_STATUS: Record<ManualPaymentOrderStatus, OrderStatus> = {
  pending_payment: 'open',
  pending_verification: 'open',
  settling: 'open',
  settled: 'completed',
  expired: 'expired',
  canceled: 'canceled',
  rejected: 'failed',
  requires_refund: 'failed',
}

/**
 * 把该账户已到期的待支付订单标记为已过期，释放它们占用的尾数。
 *
 * 只动 `pending_payment`：已申报待核验的订单要一直占着尾数，直到管理员处理，
 * 否则用户申报后金额可能被重新分配出去，人工核验就无从对账。
 *
 * @returns 被标记为已过期的订单数
 */
export async function expirePendingOrders(db: DB, accountId: string, now: Date): Promise<number> {
  const expired = await db
    .update(schema.manualPaymentDetails)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.manualPaymentDetails.accountId, accountId),
        eq(schema.manualPaymentDetails.status, 'pending_payment'),
        lte(schema.manualPaymentDetails.expiresAt, now),
      ),
    )
    .returning({ orderId: schema.manualPaymentDetails.orderId })
  await syncOrderStatuses(
    db,
    expired.map((row) => row.orderId),
    'expired',
    now,
  )
  return expired.length
}

/**
 * 创建一笔待支付的核销订单。
 *
 * 步骤：解析本地价格 → 解析收款账户 → 惰性过期该账户的待支付订单 →
 * 随机起点 + 环形扫描 99 个尾数，先写订单再写详情，由详情表的唯一索引判定冲突。
 *
 * 详情写入撞上唯一索引时，刚插入的订单行要删掉再换下一个尾数 —— 否则每次冲突
 * 都会留下一条没有详情的孤儿订单。
 */
export async function createOrder(
  db: DB,
  input: CreateOrderInput,
  now: Date = new Date(),
): Promise<ManualPaymentOrder> {
  const price = resolveManualPaymentPrice(input.productId, input.offerId)
  if (!price) {
    throw new ManualPaymentError(
      'INVALID_OFFER',
      `商品 ${input.productId} 的付费方式 ${input.offerId} 没有可用的核销价格`,
    )
  }

  const account = await resolveManualPaymentAccount(db, websiteConfig.manualPayments)
  if (!account) {
    throw new ManualPaymentError('NO_MANUAL_PAYMENT_ACCOUNT', '没有可用的收款账户')
  }

  await expirePendingOrders(db, account.id, now)

  const expiresAt = new Date(now.getTime() + MANUAL_PAYMENT_ORDER_TTL_SECONDS * 1000)
  const start = randomFingerprintStart()

  for (let offset = 0; offset < FINGERPRINT_SPAN; offset++) {
    const fingerprint = ((start - FINGERPRINT_MIN + offset) % FINGERPRINT_SPAN) + FINGERPRINT_MIN
    // 每次重试都换一个订单号：补偿删除失败时，上一轮的行可能还占着唯一索引。
    const orderNo = newOrderNo(now)
    const order = buildOrderRow({ input, price, orderNo, now, expiresAt })
    const detail = buildDetailRow({ order, account, price, fingerprint, now, expiresAt })
    try {
      await db.insert(schema.orders).values(order)
      await db.insert(schema.manualPaymentDetails).values(detail)
      return toManualPaymentOrder(order, detail)
    } catch (error) {
      // 订单已插入但详情冲突时把它删掉；删除失败也不阻塞下一轮（下一轮换订单号）。
      await db.delete(schema.orders).where(eq(schema.orders.id, order.id))
      // 唯一索引说这个尾数被占了：换下一个候选。
      if (!isUniqueConstraintError(error)) throw error
    }
  }

  throw new ManualPaymentError('AMOUNT_POOL_EXHAUSTED', '该收款账户的应付金额池已被活跃订单占满')
}

/**
 * 用户申报「我已支付」。
 *
 * 申报只是购买意图，**不写 payments、订阅或权益** —— 只有管理员核验能触发结算。
 * 申报后订单进入 `pending_verification`，继续占用尾数，直到管理员处理。
 *
 * 前置条件：订单属于该用户、状态是 `pending_payment` 且未到期。`expires_at` 与
 * 当前时间相等即视为已过期。
 */
export async function submitOrder(
  db: DB,
  input: SubmitOrderInput,
  now: Date = new Date(),
): Promise<ManualPaymentOrder> {
  const found = await readOwnedOrder(db, input.userId, input.orderId)
  if (!found) {
    throw new ManualPaymentError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (found.detail.status !== 'pending_payment') {
    throw stateError(found.detail)
  }
  if (isExpired(found.detail, now)) {
    await markExpired(db, input.userId, found.order.id, now)
    throw new ManualPaymentError('ORDER_EXPIRED', '订单已过期')
  }
  const payerNote = normalizePayerNote(input.payerNote)

  const updated = await db
    .update(schema.manualPaymentDetails)
    .set({
      status: 'pending_verification',
      payerNote,
      submittedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.manualPaymentDetails.orderId, found.order.id),
        eq(schema.manualPaymentDetails.userId, input.userId),
        eq(schema.manualPaymentDetails.status, 'pending_payment'),
        gt(schema.manualPaymentDetails.expiresAt, now),
      ),
    )
    .returning()
  const detail = updated[0]
  if (!detail) {
    // 条件不满足（刚过期，或被并发改动）：重新读取再映射稳定错误码。
    throw await resolveConflict(db, input.userId, found.order.id, now)
  }
  return toManualPaymentOrder(found.order, detail)
}

/**
 * 用户取消未支付的订单。
 *
 * 只有 `pending_payment` 可取消：已申报的订单钱可能已经付出去了，取消等于把
 * 一笔待核验的资金事实藏起来。
 */
export async function cancelOrder(
  db: DB,
  input: CancelOrderInput,
  now: Date = new Date(),
): Promise<ManualPaymentOrder> {
  const found = await readOwnedOrder(db, input.userId, input.orderId)
  if (!found) {
    throw new ManualPaymentError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (found.detail.status !== 'pending_payment') {
    // 已取消的订单重复提交：上次可能在详情落库后、订单回写前失败，这里补一次
    // 幂等同步，避免订单永远停在 open（行为仍保持抛错，见 §Fix round 3）。
    if (found.detail.status === 'canceled') {
      await syncOrderStatus(db, found.order.id, 'canceled', now)
    }
    throw stateError(found.detail)
  }
  if (isExpired(found.detail, now)) {
    await markExpired(db, input.userId, found.order.id, now)
    throw new ManualPaymentError('ORDER_EXPIRED', '订单已过期')
  }

  const updated = await db
    .update(schema.manualPaymentDetails)
    .set({ status: 'canceled', updatedAt: now })
    .where(
      and(
        eq(schema.manualPaymentDetails.orderId, found.order.id),
        eq(schema.manualPaymentDetails.userId, input.userId),
        eq(schema.manualPaymentDetails.status, 'pending_payment'),
        gt(schema.manualPaymentDetails.expiresAt, now),
      ),
    )
    .returning()
  const detail = updated[0]
  if (!detail) {
    throw await resolveConflict(db, input.userId, found.order.id, now)
  }
  await syncOrderStatus(db, found.order.id, 'canceled', now)
  return toManualPaymentOrder(found.order, detail)
}

/**
 * 读取自己的订单。
 *
 * 不属于该用户时返回 `null` —— 与「订单不存在」不可区分。
 * 读取时顺带惰性过期自己的 `pending_payment` 订单；`pending_verification`
 * 不受影响，它要一直占着尾数直到管理员处理。
 */
export async function getUserOrder(
  db: DB,
  userId: string,
  orderId: string,
  now: Date = new Date(),
): Promise<ManualPaymentOrder | null> {
  const found = await readOwnedOrder(db, userId, orderId)
  if (!found) return null
  if (found.detail.status === 'pending_payment' && isExpired(found.detail, now)) {
    await markExpired(db, userId, found.order.id, now)
    const fresh = await readOwnedOrder(db, userId, orderId)
    return fresh ? toManualPaymentOrder(fresh.order, fresh.detail) : null
  }
  return toManualPaymentOrder(found.order, found.detail)
}

/**
 * 列出自己的订单，按创建时间倒序。
 *
 * 返回前先惰性过期自己的 `pending_payment` 订单（只影响自己的待支付订单）。
 */
export async function listUserOrders(
  db: DB,
  input: ListUserOrdersInput,
  now: Date = new Date(),
): Promise<UserOrderPage> {
  const expired = await db
    .update(schema.manualPaymentDetails)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.manualPaymentDetails.userId, input.userId),
        eq(schema.manualPaymentDetails.status, 'pending_payment'),
        lte(schema.manualPaymentDetails.expiresAt, now),
      ),
    )
    .returning({ orderId: schema.manualPaymentDetails.orderId })
  await syncOrderStatuses(
    db,
    expired.map((row) => row.orderId),
    'expired',
    now,
  )

  const limit = clampLimit(input.limit)
  const offset = Math.max(0, Math.trunc(input.offset ?? 0))
  // `orders` 与在线结账共用：只取核销订单，否则分页与 total 会被别的来源污染。
  const ownedByUserAndProvider = and(
    eq(schema.orders.userId, input.userId),
    eq(schema.orders.provider, MANUAL_PAYMENT_PROVIDER),
  )
  const orders = await db
    .select()
    .from(schema.orders)
    .where(ownedByUserAndProvider)
    .orderBy(desc(schema.orders.createdAt), desc(schema.orders.id))
    .limit(limit)
    .offset(offset)
  const details = await readDetailsByOrderIds(
    db,
    orders.map((order) => order.id),
  )
  const counted = await db
    .select({ total: count() })
    .from(schema.orders)
    .where(ownedByUserAndProvider)

  return {
    rows: orders.flatMap((order) => {
      const detail = details.get(order.id)
      return detail ? [toManualPaymentOrder(order, detail)] : []
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}

/** 管理员看到的订单：额外带上下单账号的邮箱。 */
export interface AdminManualPaymentOrder extends ManualPaymentOrder {
  /** 下单账号的邮箱：人工对账时要能认出是谁付的款。 */
  email: string
}

/** 管理员订单列表的一页。 */
export interface AdminOrderPage {
  rows: AdminManualPaymentOrder[]
  total: number
}

/**
 * 列出全部订单（管理员用），按创建时间倒序。
 *
 * 与用户列表只差两点：不按 userId 过滤，且带上下单账号的邮箱。
 *
 * @param input.status 不给或传 `'all'` 表示不过滤状态
 */
export async function listAllOrders(
  db: DB,
  input: { status?: ManualPaymentOrderStatus | 'all' | null; limit: number; offset: number },
): Promise<AdminOrderPage> {
  const where =
    input.status && input.status !== 'all'
      ? eq(schema.manualPaymentDetails.status, input.status)
      : undefined

  const rows = await db
    .select({ order: schema.orders, email: schema.users.email })
    .from(schema.orders)
    .innerJoin(
      schema.manualPaymentDetails,
      eq(schema.manualPaymentDetails.orderId, schema.orders.id),
    )
    .leftJoin(schema.users, eq(schema.orders.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.orders.createdAt), desc(schema.orders.id))
    .limit(input.limit)
    .offset(input.offset)
  const details = await readDetailsByOrderIds(
    db,
    rows.map((row) => row.order.id),
  )
  const counted = await db
    .select({ total: count() })
    .from(schema.orders)
    .innerJoin(
      schema.manualPaymentDetails,
      eq(schema.manualPaymentDetails.orderId, schema.orders.id),
    )
    .where(where)

  return {
    rows: rows.flatMap((row) => {
      const detail = details.get(row.order.id)
      if (!detail) return []
      return [{ ...toManualPaymentOrder(row.order, detail), email: row.email ?? '' }]
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}

function buildOrderRow(params: {
  input: CreateOrderInput
  price: ManualPaymentPrice
  orderNo: string
  now: Date
  expiresAt: Date
}): OrderRow {
  const { input, price, orderNo, now, expiresAt } = params
  return {
    id: crypto.randomUUID(),
    orderNo,
    userId: input.userId,
    provider: MANUAL_PAYMENT_PROVIDER,
    // 订单只描述购买意图：`subscription` 表示买订阅，`payment` 表示一次性商品。
    mode: price.kind === 'subscription' ? 'subscription' : 'payment',
    productId: input.productId,
    offerId: input.offerId,
    amount: null,
    currency: null,
    status: 'open',
    providerSessionId: null,
    providerUrl: null,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }
}

function buildDetailRow(params: {
  order: OrderRow
  account: ResolvedManualPaymentAccount
  price: ManualPaymentPrice
  fingerprint: number
  now: Date
  expiresAt: Date
}): DetailRow {
  const { order, account, price, fingerprint, now, expiresAt } = params
  return {
    orderId: order.id,
    // 与 `orders.userId` 必须同时写入：结算临界区索引在本表上判定。
    userId: order.userId,
    accountId: account.id,
    channel: account.channel,
    qrImageUrl: account.qrImageUrl,
    qrImageKey: account.qrImageKey,
    baseAmount: price.amount,
    fingerprint,
    payableAmount: price.amount + fingerprint,
    currency: price.currency,
    status: 'pending_payment',
    payerNote: null,
    receiptKey: null,
    submittedAt: null,
    observedAmount: null,
    externalReference: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    expiresAt,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 把 `orders` 与 `manual_payment_details` 两行组合成领域视图。
 *
 * `kind` / `interval` / `intervalCount` 不在表里：订单只存 `mode`，周期信息
 * 属于价格配置，读取时按商品与付费方式解析；配置缺失时按「一次性」处理。
 */
export function toManualPaymentOrder(order: OrderRow, detail: DetailRow): ManualPaymentOrder {
  const price = resolveManualPaymentPrice(order.productId, order.offerId)
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    accountId: detail.accountId,
    channel: detail.channel as ManualPaymentOrder['channel'],
    qrImageUrl: detail.qrImageUrl,
    qrImageKey: detail.qrImageKey,
    productId: order.productId,
    offerId: order.offerId,
    kind: order.mode === 'subscription' ? 'subscription' : 'one_time',
    interval: price?.interval ?? null,
    intervalCount: price?.intervalCount ?? null,
    baseAmount: detail.baseAmount,
    fingerprint: detail.fingerprint,
    payableAmount: detail.payableAmount,
    currency: detail.currency as ManualPaymentOrder['currency'],
    status: detail.status as ManualPaymentOrderStatus,
    payerNote: detail.payerNote,
    receiptKey: detail.receiptKey,
    submittedAt: detail.submittedAt,
    observedAmount: detail.observedAmount,
    externalReference: detail.externalReference,
    reviewNote: detail.reviewNote,
    reviewedBy: detail.reviewedBy,
    reviewedAt: detail.reviewedAt,
    expiresAt: detail.expiresAt,
    settledAt: detail.settledAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}

/** 读取属于指定用户的订单；不存在或不属于该用户时返回 undefined。 */
function readOwnedOrder(db: DB, userId: string, orderId: string): Promise<OrderRecord | undefined> {
  return readOrderRecordById(db, orderId, userId)
}

/**
 * 订单是否已到期。
 *
 * 到期时刻等于当前时间即视为已过期：`expires_at` 存的是整数秒，比较时把
 * 当前时间也取整到秒，与数据库的 `lte` 判定保持一致。
 */
function isExpired(detail: DetailRow, now: Date): boolean {
  return detail.expiresAt.getTime() <= now.getTime()
}

/** 把已到期的待支付订单标记为过期（条件里带状态与所有者）。 */
async function markExpired(db: DB, userId: string, orderId: string, now: Date): Promise<void> {
  const updated = await db
    .update(schema.manualPaymentDetails)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.manualPaymentDetails.orderId, orderId),
        eq(schema.manualPaymentDetails.userId, userId),
        eq(schema.manualPaymentDetails.status, 'pending_payment'),
        lte(schema.manualPaymentDetails.expiresAt, now),
      ),
    )
    .returning({ orderId: schema.manualPaymentDetails.orderId })
  if (updated.length > 0) {
    await syncOrderStatus(db, orderId, 'expired', now)
  }
}

/**
 * 把核销状态同步到订单状态。
 *
 * 状态机以核销详情为准；订单行只跟随终态变化，避免两套状态互相漂移。
 */
export async function syncOrderStatus(
  db: DB,
  orderId: string,
  detailStatus: ManualPaymentOrderStatus,
  now: Date,
): Promise<void> {
  await db
    .update(schema.orders)
    .set({ status: ORDER_STATUS_BY_DETAIL_STATUS[detailStatus], updatedAt: now })
    .where(eq(schema.orders.id, orderId))
}

/** 批量同步订单状态：用于惰性过期这类一次改多行的操作。 */
export async function syncOrderStatuses(
  db: DB,
  orderIds: string[],
  detailStatus: ManualPaymentOrderStatus,
  now: Date,
): Promise<void> {
  if (orderIds.length === 0) return
  await db
    .update(schema.orders)
    .set({ status: ORDER_STATUS_BY_DETAIL_STATUS[detailStatus], updatedAt: now })
    .where(inArray(schema.orders.id, orderIds))
}

/**
 * CAS 更新落空后的错误映射：重新读取订单，翻译成稳定的错误码。
 *
 * 这样并发下的竞态（订单刚好过期、刚被取消、刚被别的请求处理）只会表现为
 * 一个确定的错误码，而不是随机的失败。
 */
async function resolveConflict(
  db: DB,
  userId: string,
  orderId: string,
  now: Date,
): Promise<ManualPaymentError> {
  const fresh = await readOwnedOrder(db, userId, orderId)
  if (!fresh) {
    return new ManualPaymentError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (fresh.detail.status === 'pending_payment' && isExpired(fresh.detail, now)) {
    await markExpired(db, userId, fresh.order.id, now)
    return new ManualPaymentError('ORDER_EXPIRED', '订单已过期')
  }
  return stateError(fresh.detail)
}

/** 把订单当前状态映射成稳定错误码。 */
function stateError(detail: DetailRow): ManualPaymentError {
  if (detail.status === 'expired') {
    return new ManualPaymentError('ORDER_EXPIRED', '订单已过期')
  }
  return new ManualPaymentError(
    'INVALID_ORDER_STATE',
    `订单当前状态为 ${detail.status}，不允许该操作`,
  )
}

/** 规范化用户辅助说明：去掉首尾空白，空值视为未填，超长拒绝。 */
function normalizePayerNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MANUAL_PAYMENT_PAYER_NOTE_MAX_LENGTH) {
    throw new ManualPaymentError(
      'INVALID_PAYER_NOTE',
      `辅助说明最多 ${MANUAL_PAYMENT_PAYER_NOTE_MAX_LENGTH} 个字符`,
    )
  }
  return trimmed
}

/** 单页条数：默认 20，最多 100。 */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20
  return Math.min(100, Math.max(1, Math.trunc(limit)))
}

/** 随机起点：1–99。随机只负责分散热点，正确性由唯一索引保证。 */
function randomFingerprintStart(): number {
  const buffer = new Uint8Array(1)
  crypto.getRandomValues(buffer)
  return ((buffer[0] ?? 0) % FINGERPRINT_SPAN) + FINGERPRINT_MIN
}

/**
 * 判断异常是不是唯一约束冲突。
 *
 * SQLite（本地与 D1 都一样）报 `UNIQUE constraint failed`；不同运行时的错误
 * 包装方式不同，所以既看消息也看错误码，还看一层 `cause`。
 */
export function isUniqueConstraintError(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) return false
  const candidate = error as {
    message?: unknown
    code?: unknown
    errcode?: unknown
    errstr?: unknown
    cause?: unknown
  }
  const text = [candidate.message, candidate.errstr]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  if (/UNIQUE constraint failed/i.test(text)) return true
  if (candidate.code === 'SQLITE_CONSTRAINT_UNIQUE' || candidate.code === 23505) return true
  // SQLite 的扩展错误码：2067 = SQLITE_CONSTRAINT_UNIQUE。
  if (candidate.errcode === 2067) return true
  if (candidate.cause && candidate.cause !== error) {
    return isUniqueConstraintError(candidate.cause, depth + 1)
  }
  return false
}
