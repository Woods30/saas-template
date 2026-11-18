import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'
import { containsInsensitive } from '@/core/db/sql'
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
  /** 余额最后变动时间；从未有过余额行为空。 */
  updatedAt: Date | string | null
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
 * 以**用户表**为主表左连余额表，而不是反过来：没发过积分的用户也要能被找到，
 * 否则管理员想给新用户发积分时，列表里根本没有这个人，无从下手。
 * 余额等字段用 `coalesce` 兜成 0。
 */
export async function queryAdminCreditBalances(
  db: DB,
  query: AdminCreditBalancesQuery = {},
): Promise<AdminCreditBalancesResult> {
  const needle = query.search?.trim()
  const where = needle ? containsInsensitive(schema.users.email, needle) : undefined
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0

  const [rows, counted] = await Promise.all([
    db
      .select({
        userId: schema.users.id,
        email: schema.users.email,
        balance: sql<number>`coalesce(${schema.creditBalances.balance}, 0)`,
        totalGranted: sql<number>`coalesce(${schema.creditBalances.totalGranted}, 0)`,
        totalConsumed: sql<number>`coalesce(${schema.creditBalances.totalConsumed}, 0)`,
        totalRefunded: sql<number>`coalesce(${schema.creditBalances.totalRefunded}, 0)`,
        updatedAt: schema.creditBalances.updatedAt,
      })
      .from(schema.users)
      .leftJoin(schema.creditBalances, eq(schema.creditBalances.userId, schema.users.id))
      .where(where)
      // 排序键用 `coalesce`：PostgreSQL 的 `DESC` 把 NULL 排在最前，SQLite 排在最后，
      // 直接按余额表的更新时间排会让两边的顺序不一致。取不到余额更新时间时退回注册时间。
      .orderBy(
        desc(sql`coalesce(${schema.creditBalances.updatedAt}, ${schema.users.createdAt})`),
        desc(schema.users.id),
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.creditBalances, eq(schema.creditBalances.userId, schema.users.id))
      .where(where),
  ])

  return {
    balances: rows.map((row) => ({
      ...row,
      balance: Number(row.balance ?? 0),
      totalGranted: Number(row.totalGranted ?? 0),
      totalConsumed: Number(row.totalConsumed ?? 0),
      totalRefunded: Number(row.totalRefunded ?? 0),
    })),
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
