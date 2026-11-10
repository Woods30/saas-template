/**
 * 核销订单：惰性过期与并发安全的应付金额分配，以及用户侧的状态机。
 *
 * 应付金额 = 标价 + 尾数，尾数取 1–99 分。同一收款账户下，活跃订单的应付金额
 * 必须全局唯一 —— 人工对着账单要能一眼分清哪笔钱对应哪张订单。
 *
 * 唯一性由数据库的 partial unique index 兜底，**不采用「先查空位再插入」**：
 * 那样并发请求会同时选中同一个尾数。这里只做随机起点 + 环形扫描，每次都真的
 * INSERT，让唯一索引来判定谁赢了。
 *
 * 状态机（见设计说明第 6 节）：`pending_payment → pending_verification →
 * settling → settled`，旁路是 `expired`、`canceled`、`rejected`、
 * `requires_refund`。
 *
 * 两条硬规则贯穿本文件：
 *
 * - **越权统一表现为订单不存在**：别人的订单读不到、改不了，也不泄漏它是否存在；
 * - **每次状态更新都带当前状态与所有者作为条件**（CAS 语义）：更新不到行就重新
 *   读取，再映射成稳定的错误码，绝不「先查再无条件 UPDATE」。
 */

import { and, count, desc, eq, gt, lte } from 'drizzle-orm'
import { resolveCollectionAccount } from '@/collection/accounts'
import { resolveCollectionPrice } from '@/collection/pricing'
import {
  type CancelOrderInput,
  COLLECTION_PAYER_NOTE_MAX_LENGTH,
  CollectionError,
  type CollectionOrder,
  type CollectionOrderStatus,
  type CollectionPrice,
  type ListUserOrdersInput,
  type ResolvedCollectionAccount,
  type SubmitOrderInput,
  type UserOrderPage,
} from '@/collection/types'
import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/db'

/** 订单有效期：精确 15 分钟。 */
export const COLLECTION_ORDER_TTL_SECONDS = 15 * 60
/** 尾数下界。 */
export const FINGERPRINT_MIN = 1
/** 尾数上界。 */
export const FINGERPRINT_MAX = 99

const FINGERPRINT_SPAN = FINGERPRINT_MAX - FINGERPRINT_MIN + 1

type CollectionOrderRow = typeof schema.collectionOrders.$inferSelect

/** 创建订单的输入。 */
export interface CreateOrderInput {
  userId: string
  productId: string
  offerId: string
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
    .update(schema.collectionOrders)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.collectionOrders.accountId, accountId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        lte(schema.collectionOrders.expiresAt, now),
      ),
    )
    .returning({ id: schema.collectionOrders.id })
  return expired.length
}

/**
 * 创建一笔待支付的核销订单。
 *
 * 步骤：解析本地价格 → 解析收款账户 → 惰性过期该账户的待支付订单 →
 * 随机起点 + 环形扫描 99 个尾数，直接 INSERT 由唯一索引判定冲突。
 */
export async function createOrder(
  db: DB,
  input: CreateOrderInput,
  now: Date = new Date(),
): Promise<CollectionOrder> {
  const price = resolveCollectionPrice(input.productId, input.offerId)
  if (!price) {
    throw new CollectionError(
      'INVALID_OFFER',
      `商品 ${input.productId} 的付费方式 ${input.offerId} 没有可用的核销价格`,
    )
  }

  const account = await resolveCollectionAccount(db, websiteConfig.collection)
  if (!account) {
    throw new CollectionError('NO_COLLECTION_ACCOUNT', '没有可用的收款账户')
  }

  await expirePendingOrders(db, account.id, now)

  const expiresAt = new Date(now.getTime() + COLLECTION_ORDER_TTL_SECONDS * 1000)
  const start = randomFingerprintStart()

  for (let offset = 0; offset < FINGERPRINT_SPAN; offset++) {
    const fingerprint = ((start - FINGERPRINT_MIN + offset) % FINGERPRINT_SPAN) + FINGERPRINT_MIN
    const row = buildOrder({ input, price, account, fingerprint, now, expiresAt })
    try {
      await db.insert(schema.collectionOrders).values(row)
      return toCollectionOrder(row)
    } catch (error) {
      // 唯一索引说这个尾数被占了：换下一个候选。
      if (!isUniqueConstraintError(error)) throw error
    }
  }

  throw new CollectionError('AMOUNT_POOL_EXHAUSTED', '该收款账户的应付金额池已被活跃订单占满')
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
): Promise<CollectionOrder> {
  const order = await readOwnedOrder(db, input.userId, input.orderId)
  if (!order) {
    throw new CollectionError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (order.status !== 'pending_payment') {
    throw stateError(order)
  }
  if (isExpired(order, now)) {
    await markExpired(db, input.userId, order.id, now)
    throw new CollectionError('ORDER_EXPIRED', '订单已过期')
  }
  const payerNote = normalizePayerNote(input.payerNote)

  const updated = await db
    .update(schema.collectionOrders)
    .set({
      status: 'pending_verification',
      payerNote,
      submittedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.collectionOrders.id, order.id),
        eq(schema.collectionOrders.userId, input.userId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        gt(schema.collectionOrders.expiresAt, now),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) {
    // 条件不满足（刚过期，或被并发改动）：重新读取再映射稳定错误码。
    throw await resolveConflict(db, input.userId, order.id, now)
  }
  return toCollectionOrder(row)
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
): Promise<CollectionOrder> {
  const order = await readOwnedOrder(db, input.userId, input.orderId)
  if (!order) {
    throw new CollectionError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (order.status !== 'pending_payment') {
    throw stateError(order)
  }
  if (isExpired(order, now)) {
    await markExpired(db, input.userId, order.id, now)
    throw new CollectionError('ORDER_EXPIRED', '订单已过期')
  }

  const updated = await db
    .update(schema.collectionOrders)
    .set({ status: 'canceled', updatedAt: now })
    .where(
      and(
        eq(schema.collectionOrders.id, order.id),
        eq(schema.collectionOrders.userId, input.userId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        gt(schema.collectionOrders.expiresAt, now),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) {
    throw await resolveConflict(db, input.userId, order.id, now)
  }
  return toCollectionOrder(row)
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
): Promise<CollectionOrder | null> {
  const order = await readOwnedOrder(db, userId, orderId)
  if (!order) return null
  if (order.status === 'pending_payment' && isExpired(order, now)) {
    await markExpired(db, userId, order.id, now)
    const fresh = await readOwnedOrder(db, userId, orderId)
    return fresh ? toCollectionOrder(fresh) : null
  }
  return toCollectionOrder(order)
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
  await db
    .update(schema.collectionOrders)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.collectionOrders.userId, input.userId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        lte(schema.collectionOrders.expiresAt, now),
      ),
    )

  const limit = clampLimit(input.limit)
  const offset = Math.max(0, Math.trunc(input.offset ?? 0))
  const rows = await db
    .select()
    .from(schema.collectionOrders)
    .where(eq(schema.collectionOrders.userId, input.userId))
    .orderBy(desc(schema.collectionOrders.createdAt), desc(schema.collectionOrders.id))
    .limit(limit)
    .offset(offset)
  const counted = await db
    .select({ total: count() })
    .from(schema.collectionOrders)
    .where(eq(schema.collectionOrders.userId, input.userId))

  return { rows: rows.map(toCollectionOrder), total: Number(counted[0]?.total ?? 0) }
}

/** 管理员看到的订单：额外带上下单账号的邮箱。 */
export interface AdminCollectionOrder extends CollectionOrder {
  /** 下单账号的邮箱：人工对账时要能认出是谁付的款。 */
  userEmail: string
}

/** 管理员订单列表的一页。 */
export interface AdminOrderPage {
  rows: AdminCollectionOrder[]
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
  input: { status?: CollectionOrderStatus | 'all' | null; limit: number; offset: number },
): Promise<AdminOrderPage> {
  const where =
    input.status && input.status !== 'all'
      ? eq(schema.collectionOrders.status, input.status)
      : undefined

  const rows = await db
    .select({ order: schema.collectionOrders, userEmail: schema.users.email })
    .from(schema.collectionOrders)
    .leftJoin(schema.users, eq(schema.collectionOrders.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.collectionOrders.createdAt), desc(schema.collectionOrders.id))
    .limit(input.limit)
    .offset(input.offset)
  const counted = await db.select({ total: count() }).from(schema.collectionOrders).where(where)

  return {
    rows: rows.map((row) => ({
      ...toCollectionOrder(row.order),
      userEmail: row.userEmail ?? '',
    })),
    total: Number(counted[0]?.total ?? 0),
  }
}

function buildOrder(params: {
  input: CreateOrderInput
  price: CollectionPrice
  account: ResolvedCollectionAccount
  fingerprint: number
  now: Date
  expiresAt: Date
}): CollectionOrderRow {
  const { input, price, account, fingerprint, now, expiresAt } = params
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    accountId: account.id,
    channel: account.channel,
    qrImageUrl: account.qrImageUrl,
    qrImageKey: account.qrImageKey,
    productId: input.productId,
    offerId: input.offerId,
    kind: price.kind,
    interval: price.interval ?? null,
    intervalCount: price.intervalCount ?? null,
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

export function toCollectionOrder(row: CollectionOrderRow): CollectionOrder {
  return {
    ...row,
    channel: row.channel as CollectionOrder['channel'],
    kind: row.kind as CollectionOrder['kind'],
    interval: row.interval as CollectionOrder['interval'],
    currency: row.currency as CollectionOrder['currency'],
    status: row.status as CollectionOrderStatus,
  }
}

/** 读取属于指定用户的订单；不存在或不属于该用户时返回 undefined。 */
async function readOwnedOrder(
  db: DB,
  userId: string,
  orderId: string,
): Promise<CollectionOrderRow | undefined> {
  const rows = await db
    .select()
    .from(schema.collectionOrders)
    .where(and(eq(schema.collectionOrders.id, orderId), eq(schema.collectionOrders.userId, userId)))
    .limit(1)
  return rows[0]
}

/**
 * 订单是否已到期。
 *
 * 到期时刻等于当前时间即视为已过期：`expires_at` 存的是整数秒，比较时把
 * 当前时间也取整到秒，与数据库的 `lte` 判定保持一致。
 */
function isExpired(order: CollectionOrderRow, now: Date): boolean {
  return order.expiresAt.getTime() <= now.getTime()
}

/** 把已到期的待支付订单标记为过期（条件里带状态与所有者）。 */
async function markExpired(db: DB, userId: string, orderId: string, now: Date): Promise<void> {
  await db
    .update(schema.collectionOrders)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.collectionOrders.id, orderId),
        eq(schema.collectionOrders.userId, userId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        lte(schema.collectionOrders.expiresAt, now),
      ),
    )
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
): Promise<CollectionError> {
  const fresh = await readOwnedOrder(db, userId, orderId)
  if (!fresh) {
    return new CollectionError('ORDER_NOT_FOUND', '订单不存在')
  }
  if (fresh.status === 'pending_payment' && isExpired(fresh, now)) {
    await markExpired(db, userId, fresh.id, now)
    return new CollectionError('ORDER_EXPIRED', '订单已过期')
  }
  return stateError(fresh)
}

/** 把订单当前状态映射成稳定错误码。 */
function stateError(order: CollectionOrderRow): CollectionError {
  if (order.status === 'expired') {
    return new CollectionError('ORDER_EXPIRED', '订单已过期')
  }
  return new CollectionError('INVALID_ORDER_STATE', `订单当前状态为 ${order.status}，不允许该操作`)
}

/** 规范化用户辅助说明：去掉首尾空白，空值视为未填，超长拒绝。 */
function normalizePayerNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > COLLECTION_PAYER_NOTE_MAX_LENGTH) {
    throw new CollectionError(
      'INVALID_PAYER_NOTE',
      `辅助说明最多 ${COLLECTION_PAYER_NOTE_MAX_LENGTH} 个字符`,
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
