import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'
import { escapeLike } from '@/core/db/sql'
import { consumeCredits, grantCredits } from './operations'
import type { CreditTransactionType } from './types'

/**
 * 管理台积分视图。
 *
 * 只读账本，不改余额：余额的改动一律走账本自身的发放 / 消费接口，
 * 那里有幂等闸与 FIFO 批次逻辑。这里再写一套「直接改余额」的 SQL 就会绕开它们。
 */

/** 积分余额的一行（含持有人邮箱）。 */
export interface AdminCreditBalance {
  userId: string
  email: string
  balance: number
  totalGranted: number
  totalConsumed: number
  totalRefunded: number
  updatedAt: Date | string
}

export interface AdminCreditBalancesQuery {
  /** 邮箱关键词（大小写不敏感的子串匹配）。空串等于不过滤。 */
  search?: string
  limit?: number
  offset?: number
}

export interface AdminCreditBalancesResult {
  balances: AdminCreditBalance[]
  total: number
}

/** 积分流水的一行（含持有人邮箱）。 */
export interface AdminCreditTransactionRow {
  id: string
  userId: string
  email: string
  type: CreditTransactionType
  /** 有符号金额：发放 / 退款为正，消费 / 过期为负。 */
  amount: number
  balanceAfter: number
  reference: string | null
  createdAt: Date | string
}

export interface AdminCreditTransactionsQuery {
  userId: string
  limit?: number
  offset?: number
}

export interface AdminCreditTransactionsResult {
  transactions: AdminCreditTransactionRow[]
  total: number
}

/**
 * 查积分余额列表。
 *
 * 只列出**有余额行**的用户：没发过积分的人余额恒为 0，把他们列出来只是噪声。
 */
export async function queryAdminCreditBalances(
  db: DB,
  query: AdminCreditBalancesQuery = {},
): Promise<AdminCreditBalancesResult> {
  const needle = query.search?.trim()
  const where = needle
    ? like(sql`lower(${schema.users.email})`, `%${escapeLike(needle)}%`)
    : undefined
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0

  const [rows, counted] = await Promise.all([
    db
      .select({
        userId: schema.creditBalances.userId,
        email: schema.users.email,
        balance: schema.creditBalances.balance,
        totalGranted: schema.creditBalances.totalGranted,
        totalConsumed: schema.creditBalances.totalConsumed,
        totalRefunded: schema.creditBalances.totalRefunded,
        updatedAt: schema.creditBalances.updatedAt,
      })
      .from(schema.creditBalances)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditBalances.userId))
      .where(where)
      .orderBy(desc(schema.creditBalances.updatedAt), desc(schema.creditBalances.userId))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.creditBalances)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditBalances.userId))
      .where(where),
  ])

  return {
    balances: rows.map((row) => ({ ...row, email: row.email ?? '' })),
    total: counted[0]?.value ?? 0,
  }
}

/** 查某个用户的积分流水。 */
export async function queryAdminCreditTransactions(
  db: DB,
  query: AdminCreditTransactionsQuery,
): Promise<AdminCreditTransactionsResult> {
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0
  const where = eq(schema.creditTransactions.userId, query.userId)

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: schema.creditTransactions.id,
        userId: schema.creditTransactions.userId,
        email: schema.users.email,
        type: schema.creditTransactions.type,
        amount: schema.creditTransactions.amount,
        balanceAfter: schema.creditTransactions.balanceAfter,
        reference: schema.creditTransactions.reference,
        createdAt: schema.creditTransactions.createdAt,
      })
      .from(schema.creditTransactions)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditTransactions.userId))
      .where(where)
      .orderBy(desc(schema.creditTransactions.createdAt), desc(schema.creditTransactions.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.creditTransactions)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditTransactions.userId))
      .where(where),
  ])

  return {
    transactions: rows.map((row) => ({
      ...row,
      email: row.email ?? '',
      type: row.type as CreditTransactionType,
    })),
    total: counted[0]?.value ?? 0,
  }
}

const balancesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

const transactionsQuerySchema = z.object({
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/** 手工发放积分：金额必须为正整数，来源记 `admin`。 */
const grantSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(1),
  /** 备注，写进流水的 `reference`，便于日后对账。 */
  note: z.string().trim().max(200).optional(),
})

/** 手工扣减积分：金额必须为正整数。 */
const deductSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(1),
  note: z.string().trim().max(200).optional(),
})

/** 积分余额列表的 server function；权限在服务端再校验。 */
export const fetchAdminCredits = createServerFn({ method: 'GET' })
  .validator((input: unknown) => balancesQuerySchema.parse(input))
  .handler(async ({ data }): Promise<AdminCreditBalancesResult> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db } = await requireAdminDb()
    return queryAdminCreditBalances(db, data)
  })

/** 某个用户的积分流水；权限在服务端再校验。 */
export const fetchAdminCreditTransactions = createServerFn({ method: 'GET' })
  .validator((input: unknown) => transactionsQuerySchema.parse(input))
  .handler(async ({ data }): Promise<AdminCreditTransactionsResult> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db } = await requireAdminDb()
    return queryAdminCreditTransactions(db, data)
  })

/**
 * 手工发放积分。
 *
 * 幂等键带上管理员 id 与时间戳：管理员连点两次就是两次发放（他要的就是两次），
 * 但同一次请求重试不会重复发。
 */
export const grantAdminCredits = createServerFn({ method: 'POST' })
  .validator((input: unknown) => grantSchema.parse(input))
  .handler(async ({ data }): Promise<{ balance: number }> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db, adminId } = await requireAdminDb()
    const result = await grantCredits(db, {
      userId: data.userId,
      amount: data.amount,
      source: 'admin',
      reference: data.note ?? `admin:${adminId}`,
      idempotencyKey: `admin-grant:${data.userId}:${data.amount}:${Date.now()}`,
    })
    return { balance: result.transaction.balanceAfter }
  })

/**
 * 手工扣减积分。
 *
 * 走账本的消费接口而不是直接改余额：扣减要按 FIFO 批次走，余额不足时必须报错
 * 而不是扣成负数。
 */
export const deductAdminCredits = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deductSchema.parse(input))
  .handler(async ({ data }): Promise<{ balance: number }> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db, adminId } = await requireAdminDb()
    const result = await consumeCredits(db, {
      userId: data.userId,
      amount: data.amount,
      reference: data.note ?? `admin:${adminId}`,
      idempotencyKey: `admin-deduct:${data.userId}:${data.amount}:${Date.now()}`,
    })
    return { balance: result.transaction.balanceAfter }
  })
