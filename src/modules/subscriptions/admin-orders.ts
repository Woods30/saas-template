import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'

/**
 * 管理台订单列表。
 *
 * 「订单」指支付流水（`payments` 表）：一笔支付就是一笔订单，退款也记在同一行上。
 * 与订阅列表分开，因为两者的状态集合不同——支付有 `partially_refunded`，
 * 订阅没有。
 */

/** 订单状态筛选。`all` 表示不过滤。 */
export type AdminOrderStatusFilter = 'all' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'

export interface AdminOrder {
  id: string
  /** 买家 id；支付行可能没有用户（外键可空，历史数据也可能有孤儿行）。 */
  userId: string | null
  /** 买家邮箱；用户行缺失时为空字符串——行本身仍然展示，不静默丢弃。 */
  email: string
  provider: string
  type: string
  status: string
  /** 金额，最小货币单位（分）。 */
  amount: number
  refundedAmount: number
  currency: string
  productId: string | null
  description: string | null
  paidAt: Date | string | null
  createdAt: Date | string
}

export interface AdminOrdersQuery {
  status?: AdminOrderStatusFilter
  limit?: number
  offset?: number
}

export interface AdminOrdersResult {
  orders: AdminOrder[]
  /** 符合筛选条件的总条数，与当页条数无关。 */
  total: number
}

/**
 * 查订单列表。
 *
 * 左连接用户表而非内连接：外键未强制时（历史数据、直接写库）支付行可能指向
 * 不存在的用户，内连接会静默丢行，让订单数与营收对不上。
 */
export async function queryAdminOrders(
  db: DB,
  query: AdminOrdersQuery = {},
): Promise<AdminOrdersResult> {
  const status = query.status ?? 'all'
  const where = status === 'all' ? undefined : eq(schema.payments.status, status)
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: schema.payments.id,
        userId: schema.payments.userId,
        email: schema.users.email,
        provider: schema.payments.provider,
        type: schema.payments.type,
        status: schema.payments.status,
        amount: schema.payments.amount,
        refundedAmount: schema.payments.refundedAmount,
        currency: schema.payments.currency,
        productId: schema.payments.productId,
        description: schema.payments.description,
        paidAt: schema.payments.paidAt,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.userId))
      .where(where)
      // `id` 作 tiebreaker：同一秒的多笔支付不少，只按时间排序时翻页会重复或漏项。
      .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.payments).where(where),
  ])

  return {
    orders: rows.map((row) => ({ ...row, email: row.email ?? '' })),
    total: counted[0]?.value ?? 0,
  }
}

const ordersQuerySchema = z.object({
  status: z.enum(['all', 'paid', 'failed', 'refunded', 'partially_refunded']).default('all'),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/**
 * 订单列表的 server function。
 *
 * 权限在服务端再校验：server function 是可被直接调用的 HTTP 端点，
 * 只靠菜单隐藏拦不住。
 */
export const fetchAdminOrders = createServerFn({ method: 'GET' })
  .validator((input: unknown) => ordersQuerySchema.parse(input))
  .handler(async ({ data }): Promise<AdminOrdersResult> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db } = await requireAdminDb()
    return queryAdminOrders(db, data)
  })
