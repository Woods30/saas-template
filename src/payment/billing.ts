import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { CurrentPlan, PaymentRecord, SubscriptionRecord } from './billing-query'

/**
 * 账单页数据的 server function。
 *
 * server function 是可被直接调用的 HTTP 端点，**必须自己校验会话**，不能依赖路由的
 * `beforeLoad`（那是页面守卫，不管 RPC）。
 *
 * 只按**当前用户**取数，不接受调用方传入 userId，否则任何登录用户都能越权读取。
 */

export type { CurrentPlan, PaymentRecord, SubscriptionRecord } from './billing-query'

export interface BillingOverview {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
  /** 当前生效的方案；多个产品并存时为 `null`（没有唯一当前方案）。 */
  currentPlan: CurrentPlan | null
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

    // schema 用动态 import，避免把 DB 拉进客户端 bundle；`eq` 零依赖，同处引入即可。
    const { eq } = await import('drizzle-orm')
    const [subscriptions, payments] = await Promise.all([
      db
        .select({
          id: schema.subscriptions.id,
          customerId: schema.subscriptions.customerId,
          subscriptionId: schema.subscriptions.subscriptionId,
          status: schema.subscriptions.status,
          priceId: schema.subscriptions.priceId,
          productId: schema.subscriptions.productId,
          stripeProductId: schema.subscriptions.stripeProductId,
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
          productId: schema.payments.productId,
          stripeProductId: schema.payments.stripeProductId,
          interval: schema.payments.interval,
          paidAt: schema.payments.paidAt,
          refundedAt: schema.payments.refundedAt,
          createdAt: schema.payments.createdAt,
        })
        .from(schema.payments)
        .where(eq(schema.payments.userId, userId))
        .orderBy(desc(schema.payments.createdAt))
        .limit(data.limit),
    ])

    // 产品 id 要靠 Price id 反查：DB 里只存 Stripe 的 Price id。
    // 取不到就退化为 null（页面显示 Price id），不能因此让整个账单页失败。
    let productIdByPriceId: Record<string, string> = {}
    try {
      const [{ getPriceCatalog }, { buildProductIdByPriceId }] = await Promise.all([
        import('./price-catalog.server'),
        import('./price-catalog'),
      ])
      productIdByPriceId = buildProductIdByPriceId(await getPriceCatalog())
    } catch (err) {
      console.warn(
        '[billing-overview] 取价目录失败，产品名退回 Price id：',
        err instanceof Error ? err.message.split('\n')[0] : 'unknown',
      )
    }

    const subscriptionRecords: SubscriptionRecord[] = subscriptions.map((sub) => ({
      ...sub,
      productId: sub.productId ?? (sub.priceId ? (productIdByPriceId[sub.priceId] ?? null) : null),
    }))

    // 当前生效方案按**产品**判定：买断与订阅属于同一产品时买断接管；不同产品并存
    // 则各自生效，没有唯一当前方案。
    const [{ resolveCurrentPlan, resolveProductHoldings }, { productExclusivityMap }] =
      await Promise.all([import('./plan-state'), import('@/config/products')])
    const exclusivityByProductId = productExclusivityMap()

    const ownedSubscriptions = subscriptionRecords.map((sub) => ({
      kind: 'subscription' as const,
      id: sub.id,
      subscriptionId: sub.subscriptionId ?? null,
      status: sub.status,
      productId: sub.productId ?? null,
      stripeProductId: sub.stripeProductId ?? null,
    }))
    const ownedPurchases = payments
      .filter((payment) => payment.type === 'one_time')
      .map((payment) => ({
        kind: 'one_time' as const,
        id: payment.id,
        status: payment.status,
        productId: payment.productId ?? null,
        stripeProductId: payment.stripeProductId ?? null,
      }))

    const current = resolveCurrentPlan({
      subscriptions: ownedSubscriptions,
      purchases: ownedPurchases,
      exclusivityByProductId,
    })
    const holdings = resolveProductHoldings({
      subscriptions: ownedSubscriptions,
      purchases: ownedPurchases,
      exclusivityByProductId,
    })

    // 每条记录标注「是否当前生效」，页面据此打「当前生效」标记：
    // 一个产品内买断接管订阅后，订阅还在列表里，但已经不再生效。
    const currentIds = new Set(
      holdings.flatMap((group) => (group.current ? [group.current.id] : [])),
    )
    const supersededIds = new Set(holdings.flatMap((group) => group.supersededSubscriptionIds))

    return {
      subscriptions: subscriptionRecords.map((sub) => ({
        ...sub,
        isCurrent: currentIds.has(sub.id),
        superseded: supersededIds.has(sub.id),
      })),
      payments: payments.map((payment) => ({
        ...payment,
        isCurrent: currentIds.has(payment.id),
      })),
      currentPlan: current
        ? {
            kind: current.kind,
            id: current.id,
            productId: current.productId ?? null,
            stripeProductId: current.stripeProductId ?? null,
          }
        : null,
    }
  })
