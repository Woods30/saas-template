/**
 * 积分账本的写操作：发放、消费、退款、过期。
 *
 * 账本的事实源是 `credit_transactions`（只追加的流水），余额是它的物化视图，
 * 存在 `credit_balances` 上。两者的一致性靠**单条条件更新**保证——
 * D1 没有交互式事务，「先查后写」在并发下必然出错，所以余额改动一律写成
 * 带条件的 UPDATE，靠影响行数判断成败。
 *
 * 两道幂等闸：
 * 1. `credit_transactions.idempotency_key` 唯一索引——挡住任何一次重放；
 * 2. `credit_balances.last_tx_key`——挡住「流水还没写下就崩了」的窗口，
 *    避免同一键被扣两次。
 *
 * FIFO：消费先扣快过期的批次（见 `ledger.ts`），退款按原批次退回。
 */
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'
import { atomic } from '@/core/db/atomic'
import { type Allocation, type CreditBucket, planAllocation, planExpiry } from './ledger'
import {
  type CreditResult,
  type CreditSource,
  type CreditTransaction,
  type CreditTransactionType,
  InsufficientCreditsError,
} from './types'

// 错误类要按值导出：调用方要用 `instanceof` 判断积分不足。
export { InsufficientCreditsError } from './types'
export type { CreditResult, CreditSource, CreditTransaction, CreditTransactionType }

export interface GrantInput {
  userId: string
  /** 正整数。 */
  amount: number
  source: CreditSource
  /** 外部引用：订单号、支付流水号。 */
  reference?: string
  /** 到期时间；不传则永不过期。 */
  expiresAt?: Date
  /** 幂等键：同一个键重复提交只生效一次。 */
  idempotencyKey: string
  /** 便于测试固定时间。 */
  now?: Date
}

export interface ConsumeInput {
  userId: string
  /** 正整数。 */
  amount: number
  reference?: string
  idempotencyKey: string
  now?: Date
}

export interface RefundInput {
  userId: string
  /** 正整数。 */
  amount: number
  reference?: string
  /** 退款后的积分何时过期；不传则永不过期。 */
  expiresAt?: Date
  idempotencyKey: string
  now?: Date
}

export interface ClawbackInput {
  userId: string
  /** 批次引用（通常是 `payments.id`）。只扣这一笔订单发放的积分。 */
  reference: string
  /** 希望扣回的积分总量；余额不够时实际扣减更少。 */
  amount: number
  /** 写进流水 metadata 的原因，例如 `refund`。 */
  reason?: string
  idempotencyKey: string
  now?: Date
}

/** 反扣结果：应扣、实际扣减与差额都带出来，便于调用方留审计痕迹。 */
export interface ClawbackResult {
  transaction: CreditTransaction
  expected: number
  deducted: number
  shortfall: number
  replayed: boolean
}

/** 余额与用量概览。 */
export interface CreditBalance {
  userId: string
  balance: number
  totalGranted: number
  totalConsumed: number
  totalRefunded: number
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function requirePositiveInteger(amount: number, label: string): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${label}必须为正整数，收到 ${amount}`)
  }
  return amount
}

/** 反扣允许为 0：全额退款时该订单的积分可能已经被消费光。 */
function requireNonNegativeInteger(amount: number, label: string): number {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${label}必须为非负整数，收到 ${amount}`)
  }
  return amount
}

/** 余额行不存在就建一行零余额。 */
async function ensureBalanceRow(db: DB, userId: string, at: Date): Promise<void> {
  await db
    .insert(schema.creditBalances)
    .values({
      userId,
      balance: 0,
      totalGranted: 0,
      totalConsumed: 0,
      totalRefunded: 0,
      lastTxKey: null,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing({ target: schema.creditBalances.userId })
}

/** 按幂等键找流水。 */
async function findTransaction(
  db: DB,
  idempotencyKey: string,
): Promise<CreditTransaction | undefined> {
  const rows = await db
    .select()
    .from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.idempotencyKey, idempotencyKey))
    .limit(1)
  const row = rows[0]
  if (!row) return undefined
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CreditTransactionType,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    reference: row.reference,
    metadata: row.metadata,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  }
}

/** 流水落库前的形状：字段齐了才允许入库。 */
interface TransactionValues {
  id: string
  userId: string
  type: CreditTransactionType
  amount: number
  balanceAfter: number
  reference: string | null
  metadata: string | null
  idempotencyKey: string
  createdAt: Date
}

function toTransaction(values: TransactionValues): CreditTransaction {
  return values
}

/** 可消费的批次：还有余额、且没过期。 */
async function loadConsumableBuckets(db: DB, userId: string, at: Date): Promise<CreditBucket[]> {
  const rows = await db
    .select({
      id: schema.creditGrants.id,
      remaining: schema.creditGrants.remaining,
      expiresAt: schema.creditGrants.expiresAt,
    })
    .from(schema.creditGrants)
    .where(
      and(
        eq(schema.creditGrants.userId, userId),
        gt(schema.creditGrants.remaining, 0),
        or(isNull(schema.creditGrants.expiresAt), gt(schema.creditGrants.expiresAt, at)),
      ),
    )
  return rows.map((row) => ({ id: row.id, remaining: row.remaining, expiresAt: row.expiresAt }))
}

/**
 * 发放积分。
 *
 * 每次发放开一个批次（桶）：批次有到期时间与剩余量，消费按 FIFO 扣批次。
 */
export async function grantCredits(db: DB, input: GrantInput): Promise<CreditResult> {
  const amount = requirePositiveInteger(input.amount, '发放积分')
  const existing = await findTransaction(db, input.idempotencyKey)
  if (existing) return { transaction: existing, replayed: true }

  return atomic(db, async (tx) => {
    const at = input.now ?? new Date()
    await ensureBalanceRow(tx, input.userId, at)

    await tx.insert(schema.creditGrants).values({
      id: newId('grant'),
      userId: input.userId,
      amount,
      remaining: amount,
      source: input.source,
      reference: input.reference ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: at,
      updatedAt: at,
    })

    const [updated] = await tx
      .update(schema.creditBalances)
      .set({
        balance: sql`${schema.creditBalances.balance} + ${amount}`,
        totalGranted: sql`${schema.creditBalances.totalGranted} + ${amount}`,
        lastTxKey: input.idempotencyKey,
        updatedAt: at,
      })
      .where(eq(schema.creditBalances.userId, input.userId))
      .returning({ balance: schema.creditBalances.balance })

    const transaction = toTransaction({
      id: newId('ctx'),
      userId: input.userId,
      type: 'grant',
      amount,
      balanceAfter: updated?.balance ?? amount,
      reference: input.reference ?? null,
      metadata: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    })
    await tx.insert(schema.creditTransactions).values(transaction)
    return { transaction, replayed: false }
  })
}

/**
 * 消费积分。
 *
 * 余额不足抛 `InsufficientCreditsError`，**不写任何流水**——失败的操作不留痕，
 * 否则调用方重试会撞上幂等键。
 *
 * 消费前先作废过期批次：过期的积分不该被消费，也不该继续算在余额里。
 */
export async function consumeCredits(db: DB, input: ConsumeInput): Promise<CreditResult> {
  const amount = requirePositiveInteger(input.amount, '消费积分')
  const existing = await findTransaction(db, input.idempotencyKey)
  if (existing) return { transaction: existing, replayed: true }

  return atomic(db, async (tx) => {
    const at = input.now ?? new Date()
    await expireBuckets(tx, input.userId, at)
    await ensureBalanceRow(tx, input.userId, at)

    const buckets = await loadConsumableBuckets(tx, input.userId, at)
    const available = buckets.reduce((sum, bucket) => sum + bucket.remaining, 0)
    if (available < amount) {
      throw new InsufficientCreditsError(amount, available)
    }

    const allocations = planAllocation(buckets, amount)

    // 余额扣减：单条条件更新。余额不够时影响行数为 0，不会写出负余额。
    const [updated] = await tx
      .update(schema.creditBalances)
      .set({
        balance: sql`${schema.creditBalances.balance} - ${amount}`,
        totalConsumed: sql`${schema.creditBalances.totalConsumed} + ${amount}`,
        lastTxKey: input.idempotencyKey,
        updatedAt: at,
      })
      .where(
        and(
          eq(schema.creditBalances.userId, input.userId),
          gte(schema.creditBalances.balance, amount),
          or(
            isNull(schema.creditBalances.lastTxKey),
            ne(schema.creditBalances.lastTxKey, input.idempotencyKey),
          ),
        ),
      )
      .returning({ balance: schema.creditBalances.balance })

    if (!updated) {
      // 0 行：余额被并发扣走了，或者同一键已经扣过。
      const current = await tx
        .select({
          balance: schema.creditBalances.balance,
          lastTxKey: schema.creditBalances.lastTxKey,
        })
        .from(schema.creditBalances)
        .where(eq(schema.creditBalances.userId, input.userId))
        .limit(1)
      const row = current[0]
      if (row?.lastTxKey === input.idempotencyKey) {
        // 同一键已经改过余额：视为重放，绝不扣第二次。
        const replay = await findTransaction(tx, input.idempotencyKey)
        return {
          transaction:
            replay ??
            toTransaction({
              id: newId('ctx'),
              userId: input.userId,
              type: 'consume',
              amount: -amount,
              balanceAfter: row.balance,
              reference: input.reference ?? null,
              metadata: null,
              idempotencyKey: input.idempotencyKey,
              createdAt: at,
            }),
          replayed: true,
        }
      }
      throw new InsufficientCreditsError(amount, row?.balance ?? 0)
    }

    // 扣批次：条件更新保证不会把批次扣成负数。
    for (const allocation of allocations) {
      await tx
        .update(schema.creditGrants)
        .set({
          remaining: sql`${schema.creditGrants.remaining} - ${allocation.amount}`,
          updatedAt: at,
        })
        .where(
          and(
            eq(schema.creditGrants.id, allocation.grantId),
            gte(schema.creditGrants.remaining, allocation.amount),
          ),
        )
    }

    const transaction = toTransaction({
      id: newId('ctx'),
      userId: input.userId,
      type: 'consume',
      amount: -amount,
      balanceAfter: updated.balance,
      reference: input.reference ?? null,
      metadata: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    })
    await tx.insert(schema.creditTransactions).values(transaction)

    for (const allocation of allocations) {
      await tx.insert(schema.creditAllocations).values({
        id: newId('cal'),
        transactionId: transaction.id,
        grantId: allocation.grantId,
        amount: allocation.amount,
        createdAt: at,
      })
    }

    return { transaction, replayed: false }
  })
}

/**
 * 退款：把积分还回去。
 *
 * 退回来的积分开一个**新批次**（来源 `refund`），而不是塞回原批次——原批次可能
 * 已经过期，塞回去等于给用户一批立刻作废的积分。退款后的到期时间由调用方给，
 * 不给则永不过期。
 */
export async function refundCredits(db: DB, input: RefundInput): Promise<CreditResult> {
  const amount = requirePositiveInteger(input.amount, '退款积分')
  const existing = await findTransaction(db, input.idempotencyKey)
  if (existing) return { transaction: existing, replayed: true }

  return atomic(db, async (tx) => {
    const at = input.now ?? new Date()
    await ensureBalanceRow(tx, input.userId, at)

    await tx.insert(schema.creditGrants).values({
      id: newId('grant'),
      userId: input.userId,
      amount,
      remaining: amount,
      source: 'refund',
      reference: input.reference ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: at,
      updatedAt: at,
    })

    const [updated] = await tx
      .update(schema.creditBalances)
      .set({
        balance: sql`${schema.creditBalances.balance} + ${amount}`,
        totalRefunded: sql`${schema.creditBalances.totalRefunded} + ${amount}`,
        lastTxKey: input.idempotencyKey,
        updatedAt: at,
      })
      .where(eq(schema.creditBalances.userId, input.userId))
      .returning({ balance: schema.creditBalances.balance })

    const transaction = toTransaction({
      id: newId('ctx'),
      userId: input.userId,
      type: 'refund',
      amount,
      balanceAfter: updated?.balance ?? amount,
      reference: input.reference ?? null,
      metadata: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    })
    await tx.insert(schema.creditTransactions).values(transaction)
    return { transaction, replayed: false }
  })
}

/**
 * 反扣积分（退款用）。
 *
 * 只扣这一笔订单发放的批次：别的来源（赠送、别的订单）不动。余额不足时扣到 0
 * 为止——退款不能因为积分不够而失败，也不允许把余额打成负数；差额写进流水的
 * `metadata`，便于对账。
 *
 * 幂等键与发放同构：同一次退款重复回调只扣一次。
 */
export async function clawbackCredits(db: DB, input: ClawbackInput): Promise<ClawbackResult> {
  const expected = requireNonNegativeInteger(input.amount, '反扣积分')
  const existing = await findTransaction(db, input.idempotencyKey)
  if (existing) {
    const deducted = Math.max(0, -existing.amount)
    return {
      transaction: existing,
      expected,
      deducted,
      shortfall: Math.max(0, expected - deducted),
      replayed: true,
    }
  }

  return atomic(db, async (tx) => {
    const at = input.now ?? new Date()
    await ensureBalanceRow(tx, input.userId, at)

    // 当前余额是扣减上限：批次剩余量理论上不大于余额，这里再兜一次底。
    const [balanceRow] = await tx
      .select({ balance: schema.creditBalances.balance })
      .from(schema.creditBalances)
      .where(eq(schema.creditBalances.userId, input.userId))
      .limit(1)
    let toTake = Math.min(expected, balanceRow?.balance ?? 0)

    const buckets = await tx
      .select({ id: schema.creditGrants.id, remaining: schema.creditGrants.remaining })
      .from(schema.creditGrants)
      .where(
        and(
          eq(schema.creditGrants.userId, input.userId),
          eq(schema.creditGrants.reference, input.reference),
          gt(schema.creditGrants.remaining, 0),
        ),
      )
      .orderBy(asc(schema.creditGrants.createdAt), asc(schema.creditGrants.id))

    let deducted = 0
    for (const bucket of buckets) {
      if (toTake <= 0) break
      const take = Math.min(bucket.remaining, toTake)
      // 条件更新：并发消费先把批次扣走时影响行数为 0，跳过这个批次。
      const cleared = await tx
        .update(schema.creditGrants)
        .set({
          remaining: sql`${schema.creditGrants.remaining} - ${take}`,
          updatedAt: at,
        })
        .where(and(eq(schema.creditGrants.id, bucket.id), gte(schema.creditGrants.remaining, take)))
        .returning({ id: schema.creditGrants.id })
      if (cleared.length === 0) continue
      deducted += take
      toTake -= take
    }

    let balanceAfter = balanceRow?.balance ?? 0
    if (deducted > 0) {
      const [updated] = await tx
        .update(schema.creditBalances)
        .set({
          balance: sql`${schema.creditBalances.balance} - ${deducted}`,
          lastTxKey: input.idempotencyKey,
          updatedAt: at,
        })
        .where(
          and(
            eq(schema.creditBalances.userId, input.userId),
            gte(schema.creditBalances.balance, deducted),
          ),
        )
        .returning({ balance: schema.creditBalances.balance })
      if (updated) {
        balanceAfter = updated.balance
      } else {
        // 并发改动抢先一步：按当前余额重新扣，最多扣到 0。
        const [current] = await tx
          .update(schema.creditBalances)
          .set({
            balance: sql`max(0, ${schema.creditBalances.balance} - ${deducted})`,
            lastTxKey: input.idempotencyKey,
            updatedAt: at,
          })
          .where(eq(schema.creditBalances.userId, input.userId))
          .returning({ balance: schema.creditBalances.balance })
        balanceAfter = current?.balance ?? 0
      }
    }

    const metadata = JSON.stringify({
      reason: input.reason ?? 'clawback',
      expected,
      deducted,
      shortfall: expected - deducted,
    })
    const transaction = toTransaction({
      id: newId('ctx'),
      userId: input.userId,
      type: 'adjust',
      amount: -deducted,
      balanceAfter,
      reference: input.reference,
      metadata,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    })
    await tx.insert(schema.creditTransactions).values(transaction)
    return { transaction, expected, deducted, shortfall: expected - deducted, replayed: false }
  })
}

/**
 * 作废已过期的批次。
 *
 * 顺序是「先把批次清零，再改余额」：批次清零是条件更新（`remaining > 0`），
 * 影响行数为 0 说明已经作废过，不会重复扣余额。
 */
async function expireBuckets(db: DB, userId: string, at: Date): Promise<CreditResult[]> {
  const rows = await db
    .select({
      id: schema.creditGrants.id,
      remaining: schema.creditGrants.remaining,
      expiresAt: schema.creditGrants.expiresAt,
    })
    .from(schema.creditGrants)
    .where(
      and(
        eq(schema.creditGrants.userId, userId),
        gt(schema.creditGrants.remaining, 0),
        isNotNull(schema.creditGrants.expiresAt),
        lte(schema.creditGrants.expiresAt, at),
      ),
    )
  const expired: Allocation[] = planExpiry(rows, at)
  if (expired.length === 0) return []

  const results: CreditResult[] = []
  for (const allocation of expired) {
    const cleared = await db
      .update(schema.creditGrants)
      .set({ remaining: 0, updatedAt: at })
      .where(
        and(eq(schema.creditGrants.id, allocation.grantId), gt(schema.creditGrants.remaining, 0)),
      )
      .returning({ id: schema.creditGrants.id })
    if (cleared.length === 0) continue

    const [updated] = await db
      .update(schema.creditBalances)
      .set({
        balance: sql`${schema.creditBalances.balance} - ${allocation.amount}`,
        lastTxKey: `expire:${allocation.grantId}`,
        updatedAt: at,
      })
      .where(
        and(
          eq(schema.creditBalances.userId, userId),
          gte(schema.creditBalances.balance, allocation.amount),
        ),
      )
      .returning({ balance: schema.creditBalances.balance })

    const transaction = toTransaction({
      id: newId('ctx'),
      userId,
      type: 'expire',
      amount: -allocation.amount,
      balanceAfter: updated?.balance ?? 0,
      reference: null,
      metadata: null,
      idempotencyKey: `expire:${allocation.grantId}`,
      createdAt: at,
    })
    await db.insert(schema.creditTransactions).values(transaction)
    results.push({ transaction, replayed: false })
  }
  return results
}

/**
 * 作废某个用户已过期的批次。
 *
 * 消费时会顺带做一次；这个入口给定时任务与后台刷新用。
 */
export async function expireCredits(
  db: DB,
  userId: string,
  at: Date = new Date(),
): Promise<CreditResult[]> {
  return expireBuckets(db, userId, at)
}

/** 当前余额；没有余额行时返回 0。 */
export async function getBalance(db: DB, userId: string): Promise<number> {
  const rows = await db
    .select({ balance: schema.creditBalances.balance })
    .from(schema.creditBalances)
    .where(eq(schema.creditBalances.userId, userId))
    .limit(1)
  return rows[0]?.balance ?? 0
}

/** 余额概览：余额与累计发放 / 消费 / 退款。 */
export async function getBalanceSummary(db: DB, userId: string): Promise<CreditBalance> {
  const rows = await db
    .select()
    .from(schema.creditBalances)
    .where(eq(schema.creditBalances.userId, userId))
    .limit(1)
  const row = rows[0]
  return {
    userId,
    balance: row?.balance ?? 0,
    totalGranted: row?.totalGranted ?? 0,
    totalConsumed: row?.totalConsumed ?? 0,
    totalRefunded: row?.totalRefunded ?? 0,
  }
}

/** 流水列表：最近的在前。 */
export async function listTransactions(
  db: DB,
  userId: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  const rows = await db
    .select()
    .from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, userId))
    .orderBy(desc(schema.creditTransactions.createdAt))
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: row.type as CreditTransactionType,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    reference: row.reference,
    metadata: row.metadata,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  }))
}
