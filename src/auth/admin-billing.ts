import { createServerFn } from '@tanstack/react-start'
import {
  type AdminPaymentRow,
  type RevenueSummary,
  summarizeRevenue,
} from '@/payment/admin-billing-query'

/**
 * 管理台账单总览的 server function。
 *
 * 权限必须在服务端再校验：server function 是可被直接调用的 HTTP 端点，
 * 只靠菜单隐藏拦不住。非管理员一律 403，不回空数据——避免把「被拒绝」伪装成
 * 「没有记录」。
 */

/** 订阅列表的一行（含购买者邮箱）。 */
export interface AdminSubscription {
  id: string
  userId: string
  email: string
  productId: string | null
  status: string
  amount: number | null
  currency: string | null
  interval: string | null
  intervalCount: number | null
  currentPeriodEnd: Date | string | null
  cancelAtPeriodEnd: boolean | null
  createdAt: Date | string
}

export interface AdminBillingResult {
  revenue: RevenueSummary
  subscriptions: AdminSubscription[]
  /** 订阅按状态计数，便于一眼看出活跃规模。 */
  activeSubscriptionCount: number
}

/** 未终止的订阅状态：这些才占用「每账号一份订阅」的名额。 */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

export const fetchAdminBilling = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminBillingResult> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const { desc, eq } = await import('drizzle-orm')
    const { createDb, schema } = await import('@/db')

    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    if (session?.user.role !== 'admin') throw new Response(null, { status: 403 })

    const db = createDb(env.DB)

    const [subscriptionRows, paymentRows] = await Promise.all([
      db
        .select({
          id: schema.subscriptions.id,
          userId: schema.subscriptions.userId,
          email: schema.users.email,
          productId: schema.subscriptions.productId,
          status: schema.subscriptions.status,
          amount: schema.subscriptions.amount,
          currency: schema.subscriptions.currency,
          interval: schema.subscriptions.interval,
          intervalCount: schema.subscriptions.intervalCount,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
          createdAt: schema.subscriptions.createdAt,
        })
        .from(schema.subscriptions)
        // 左连接而非内连接：外键未强制时（如历史数据或直接写库）用户行可能缺失，
        // 内连接会静默丢行，让订阅数与营收对不上。缺失时邮箱留空，行仍展示。
        .leftJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
        .orderBy(desc(schema.subscriptions.createdAt)),
      db
        .select({
          amount: schema.payments.amount,
          currency: schema.payments.currency,
          refundedAmount: schema.payments.refundedAmount,
          status: schema.payments.status,
        })
        .from(schema.payments),
    ])

    return {
      revenue: summarizeRevenue(paymentRows as AdminPaymentRow[]),
      subscriptions: subscriptionRows.map((row) => ({
        ...row,
        email: row.email ?? '',
      })) as AdminSubscription[],
      activeSubscriptionCount: subscriptionRows.filter((row) => ACTIVE_STATUSES.has(row.status))
        .length,
    }
  },
)
