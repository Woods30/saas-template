import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { PaymentRecord, SubscriptionRecord } from './billing-query'

export type { PaymentRecord, SubscriptionRecord } from './billing-query'
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
      { createDb, schema },
      { eq, desc },
      { findCustomerId },
      { websiteConfig },
    ] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/db'),
      import('drizzle-orm'),
      import('./checkout'),
      import('@/config/website'),
    ])
    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Response('Unauthorized', { status: 401 })
    const db = createDb(env.DB)
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

export const fetchCurrentPlan = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SubscriptionRecord | null> => {
    const [
      { getServerContext },
      { getAuth },
      { getRequestHeaders },
      { createDb, schema },
      { and, eq, inArray },
      { ACTIVE_SUBSCRIPTION_STATUSES },
    ] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/db'),
      import('drizzle-orm'),
      import('./plan-state'),
    ])
    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    if (!session) return null
    const [row] = await createDb(env.DB)
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
