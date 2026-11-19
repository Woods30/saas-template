import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'

/**
 * 管理台订阅列表。
 *
 * 与订单列表分开的原因：订阅的状态集合更细（`trialing` / `past_due` /
 * `canceled` 各自成档），且订阅关心的是**下次续费时间**而不是收款流水。
 */

/** 订阅状态筛选。`all` 表示不过滤。 */
export type AdminSubscriptionStatusFilter =
  | 'all'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export interface AdminSubscriptionItem {
  id: string
  userId: string
  /** 买家邮箱；用户行缺失时为空字符串。 */
  email: string
  provider: string
  productId: string | null
  offerId: string | null
  status: string
  /** 金额，最小货币单位（分）；渠道未回传时为空。 */
  amount: number | null
  currency: string | null
  /** 计费周期：`month` / `year`；一次性购买为空。 */
  interval: string | null
  currentPeriodEnd: Date | string | null
  cancelAtPeriodEnd: boolean | null
  createdAt: Date | string
}

export interface AdminSubscriptionsQuery {
  status?: AdminSubscriptionStatusFilter
  limit?: number
  offset?: number
}

export interface AdminSubscriptionsResult {
  subscriptions: AdminSubscriptionItem[]
  total: number
}

/**
 * 查订阅列表。
 *
 * 左连接用户表：外键未强制时订阅行可能指向不存在的用户，内连接会静默丢行。
 */
export async function queryAdminSubscriptions(
  db: DB,
  query: AdminSubscriptionsQuery = {},
): Promise<AdminSubscriptionsResult> {
  const status = query.status ?? 'all'
  const where = status === 'all' ? undefined : eq(schema.subscriptions.status, status)
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        email: schema.users.email,
        provider: schema.subscriptions.provider,
        productId: schema.subscriptions.productId,
        offerId: schema.subscriptions.offerId,
        status: schema.subscriptions.status,
        amount: schema.subscriptions.amount,
        currency: schema.subscriptions.currency,
        interval: schema.subscriptions.interval,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
        createdAt: schema.subscriptions.createdAt,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .where(where)
      .orderBy(desc(schema.subscriptions.createdAt), desc(schema.subscriptions.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.subscriptions).where(where),
  ])

  return {
    subscriptions: rows.map((row) => ({ ...row, email: row.email ?? '' })),
    total: counted[0]?.value ?? 0,
  }
}

const subscriptionsQuerySchema = z.object({
  status: z
    .enum(['all', 'active', 'trialing', 'past_due', 'canceled', 'incomplete'])
    .default('all'),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/** 订阅列表的 server function；权限在服务端再校验。 */
export const fetchAdminSubscriptions = createServerFn({ method: 'GET' })
  .validator((input: unknown) => subscriptionsQuerySchema.parse(input))
  .handler(async ({ data }): Promise<AdminSubscriptionsResult> => {
    const { requirePermissionDb } = await import('@/core/auth/session')
    const { db } = await requirePermissionDb('admin.subscriptions.read')
    return queryAdminSubscriptions(db, data)
  })
