import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { PaymentRecord, SubscriptionRecord } from './query'

export type { PaymentRecord, SubscriptionRecord } from './query'
export interface BillingOverview {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
  canManage: boolean
}

export const fetchBillingOverview = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(input),
  )
  .handler(async ({ data }): Promise<BillingOverview> => {
    const [
      { getServerContext },
      { getAuth },
      { getRequestHeaders },
      { createDbFromEnv, schema },
      { eq, desc },
      { findCustomerId },
      { websiteConfig },
    ] = await Promise.all([
      import('@/lib/server-context'),
      import('@/core/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/core/db'),
      import('drizzle-orm'),
      import('./checkout'),
      import('@/config/website'),
    ])
    const env = getServerContext().env
    const session = await (await getAuth(env)).api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Response('Unauthorized', { status: 401 })
    const db = await createDbFromEnv(env)
    const [subscriptions, payments, customerId] = await Promise.all([
      db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, session.user.id))
        .orderBy(desc(schema.subscriptions.createdAt)),
      db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.userId, session.user.id))
        .orderBy(desc(schema.payments.createdAt))
        .limit(data.limit),
      findCustomerId(db, session.user.id, websiteConfig.payment.provider),
    ])
    return { subscriptions, payments, canManage: Boolean(customerId) }
  })

export interface CancelSubscriptionResult {
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: Date | null
}

/**
 * 用户自助取消订阅：**期末生效**。
 *
 * 已付的周期不收回——立即终止等于没收用户已经付过钱的剩余时间。渠道侧用
 * `cancel_at_period_end`（Stripe）或 `mode: scheduled`（Creem）表达，本地快照
 * 同步写入，账单页立刻能看到「到期不再续费」。
 */
export const cancelMySubscription = createServerFn({ method: 'POST' }).handler(
  async (): Promise<CancelSubscriptionResult> => {
    const [
      { getServerContext },
      { getAuth },
      { getRequestHeaders },
      { createDbFromEnv, schema },
      { and, eq, inArray, sql },
      { getPaymentProvider },
      { ACTIVE_SUBSCRIPTION_STATUSES },
    ] = await Promise.all([
      import('@/lib/server-context'),
      import('@/core/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/core/db'),
      import('drizzle-orm'),
      import('@/core/payment'),
      import('./plan-state'),
    ])
    const env = getServerContext().env
    const session = await (await getAuth(env)).api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Response(null, { status: 401 })
    const db = await createDbFromEnv(env)
    const [row] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, session.user.id),
          inArray(schema.subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        ),
      )
      .limit(1)
    if (!row) throw new Response(null, { status: 404 })
    if (row.cancelAtPeriodEnd) {
      return { cancelAtPeriodEnd: true, currentPeriodEnd: row.currentPeriodEnd }
    }
    if (row.provider !== 'stripe' && row.provider !== 'creem') {
      // 核销型收款没有可取消的渠道订阅：到期自然失效，走人工处理。
      throw new Response('CANCEL_UNSUPPORTED', { status: 400 })
    }
    const provider = getPaymentProvider(row.provider)
    const result = await provider.cancelSubscription(row.subscriptionId)
    const currentPeriodEnd = result.currentPeriodEnd
      ? new Date(result.currentPeriodEnd * 1000)
      : row.currentPeriodEnd
    await db
      .update(schema.subscriptions)
      .set({
        status: result.status,
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        // 本地写也是快照版本推进：webhook 的旧快照不能把它覆盖回去。
        snapshotVersion: sql`${schema.subscriptions.snapshotVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, row.id))
    return { cancelAtPeriodEnd: true, currentPeriodEnd }
  },
)

export const fetchCurrentPlan = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SubscriptionRecord | null> => {
    const [
      { getServerContext },
      { getAuth },
      { getRequestHeaders },
      { createDbFromEnv, schema },
      { and, eq, inArray },
      { ACTIVE_SUBSCRIPTION_STATUSES },
    ] = await Promise.all([
      import('@/lib/server-context'),
      import('@/core/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/core/db'),
      import('drizzle-orm'),
      import('./plan-state'),
    ])
    const env = getServerContext().env
    const session = await (await getAuth(env)).api.getSession({ headers: getRequestHeaders() })
    if (!session) return null
    const [row] = await (await createDbFromEnv(env))
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, session.user.id),
          inArray(schema.subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        ),
      )
      .limit(1)
    return row ?? null
  },
)
