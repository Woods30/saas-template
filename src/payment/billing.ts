import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { PaymentRecord, SubscriptionRecord } from './billing-query'

/**
 * 账单页数据的 server function。
 *
 * 与 `fetchAdminUsers` 同一套考量：订阅与流水在 D1 里，客户端没有也不应该有直接
 * 读 `DB` binding 的通道，只能经 server function；而 server function 是可被直接
 * 调用的 HTTP 端点，因此**必须自己校验会话**，不能依赖路由的 `beforeLoad`
 * （那是页面的守卫，不管 RPC）。
 *
 * 只按**当前用户**取数，不接受调用方传入 userId——否则把任意用户的订阅状态暴露给
 * 任何登录用户（越权读）。取消订阅走 `/api/payment` 的 DELETE，本函数只读。
 */

export type { PaymentRecord, SubscriptionRecord } from './billing-query'

export interface BillingOverview {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
}

const querySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
})

export const fetchBillingOverview = createServerFn({ method: 'GET' })
  .validator((input: unknown) => querySchema.parse(input))
  .handler(async ({ data }): Promise<BillingOverview> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const { desc } = await import('drizzle-orm')
    const { createDb, schema } = await import('@/db')

    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Response(null, { status: 401 })

    const db = createDb(env.DB)
    const userId = session.user.id

    // 订阅按创建时间倒序取最近几条；流水按创建时间倒序。两者在同一轮
    // `Promise.all` 里并行，账单页首屏一次拿全。
    //
    // `eq` 在 handler 内引入：schema 是动态 import 的（与 `admin-users.ts` 同一
    // 手法，避免把 DB 拉进客户端 bundle），`eq` 本身零依赖，同步取即可。
    const { eq } = await import('drizzle-orm')
    const [subscriptions, payments] = await Promise.all([
      db
        .select({
          id: schema.subscriptions.id,
          customerId: schema.subscriptions.customerId,
          subscriptionId: schema.subscriptions.subscriptionId,
          status: schema.subscriptions.status,
          priceId: schema.subscriptions.priceId,
          amount: schema.subscriptions.amount,
          currency: schema.subscriptions.currency,
          interval: schema.subscriptions.interval,
          currentPeriodStart: schema.subscriptions.currentPeriodStart,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
          createdAt: schema.subscriptions.createdAt,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(10),
      db
        .select({
          id: schema.payments.id,
          type: schema.payments.type,
          status: schema.payments.status,
          amount: schema.payments.amount,
          currency: schema.payments.currency,
          description: schema.payments.description,
          paidAt: schema.payments.paidAt,
          refundedAt: schema.payments.refundedAt,
          createdAt: schema.payments.createdAt,
        })
        .from(schema.payments)
        .where(eq(schema.payments.userId, userId))
        .orderBy(desc(schema.payments.createdAt))
        .limit(data.limit),
    ])

    return { subscriptions, payments }
  })
