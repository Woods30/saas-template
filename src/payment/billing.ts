import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  CurrentPlan,
  PaymentRecord,
  PendingChange,
  SubscriptionRecord,
  SwitchTarget,
} from './billing-query'
import type { PriceCatalog } from './price-catalog'

/**
 * 账单页数据的 server function。
 *
 * server function 是可被直接调用的 HTTP 端点，**必须自己校验会话**，不能依赖路由的
 * `beforeLoad`（那是页面守卫，不管 RPC）。
 *
 * 只按**当前用户**取数，不接受调用方传入 userId，否则任何登录用户都能越权读取。
 */

export type {
  CurrentPlan,
  PaymentRecord,
  PendingChange,
  SubscriptionRecord,
  SwitchTarget,
} from './billing-query'

export interface BillingOverview {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
  /** 当前生效的方案（等级最高的那个持有物）；同级并列时为 `null`。 */
  currentPlan: CurrentPlan | null
  /**
   * 可切换到的目标（档位 × 周期）。
   *
   * 没有活跃订阅时为空数组：一个账号最多一份订阅，没有当前方案就没有可切换的起点。
   */
  switchTargets: SwitchTarget[]
  /** 已安排、周期末生效的变更（降级）。 */
  pendingChange: PendingChange | null
}

const querySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
})

/** 时间 → ISO 字符串；缺失或非法时返回 `null`，绝不写 `Invalid Date`。 */
function toIsoString(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value))
  if (Number.isNaN(time)) return new Date(0).toISOString()
  return new Date(time).toISOString()
}

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
          pendingPriceId: schema.subscriptions.pendingPriceId,
          pendingProductId: schema.subscriptions.pendingProductId,
          pendingInterval: schema.subscriptions.pendingInterval,
          pendingAmount: schema.subscriptions.pendingAmount,
          pendingCurrency: schema.subscriptions.pendingCurrency,
          pendingEffectiveAt: schema.subscriptions.pendingEffectiveAt,
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
    let catalog: PriceCatalog | null = null
    try {
      const [{ getPriceCatalog }, { buildProductIdByPriceId }] = await Promise.all([
        import('./price-catalog.server'),
        import('./price-catalog'),
      ])
      catalog = await getPriceCatalog()
      productIdByPriceId = buildProductIdByPriceId(catalog)
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

    // 当前生效方案按**等级**判定：持有物里等级最高的那个（`lifetime > pro > free`）。
    // 同一产品内买断接管订阅、跨产品高级别顶替低级别，都落在这条规则上。
    const [
      { isActiveSubscriptionStatus, resolveCurrentPlan, resolveProductHoldings },
      { productExclusivityMap, productTierMap, resolveLookupKey, subscriptionTargets },
    ] = await Promise.all([import('./plan-state'), import('@/config/products')])
    const context = {
      tiersByProductId: productTierMap(),
      exclusivityByProductId: productExclusivityMap(),
    }

    const ownedSubscriptions = subscriptionRecords.map((sub) => ({
      kind: 'subscription' as const,
      id: sub.id,
      subscriptionId: sub.subscriptionId ?? null,
      status: sub.status,
      productId: sub.productId ?? null,
      stripeProductId: sub.stripeProductId ?? null,
      createdAt: sub.createdAt,
    }))
    const ownedPurchases = payments
      .filter((payment) => payment.type === 'one_time')
      .map((payment) => ({
        kind: 'one_time' as const,
        id: payment.id,
        status: payment.status,
        productId: payment.productId ?? null,
        stripeProductId: payment.stripeProductId ?? null,
        createdAt: payment.createdAt,
      }))

    const current = resolveCurrentPlan({
      subscriptions: ownedSubscriptions,
      purchases: ownedPurchases,
      context,
    })
    const holdings = resolveProductHoldings({
      subscriptions: ownedSubscriptions,
      purchases: ownedPurchases,
      context,
    })

    // 「当前生效」只有一个：等级最高的那个持有物。别的都标成已被取代——
    // 订阅还在列表里（历史），但不再生效，也不再扣费。
    const currentIds = new Set(current ? [current.id] : [])
    const supersededIds = new Set(holdings.flatMap((group) => group.supersededSubscriptionIds))

    // 切换目标：账号级唯一订阅——有且只有一份活跃订阅时才有可切换的起点。
    // 多份活跃订阅是脏数据（绕过本站开的），此时不给切换入口：改哪一份都说不清。
    const activeSubscriptions = subscriptionRecords.filter((sub) =>
      isActiveSubscriptionStatus(sub.status),
    )
    const activeSubscription = activeSubscriptions.length === 1 ? activeSubscriptions[0] : null

    const switchTargets: SwitchTarget[] = []
    if (activeSubscription && catalog) {
      const { resolveSwitchDirection } = await import('./plan-state')
      const periodEnd = activeSubscription.currentPeriodEnd
        ? new Date(
            activeSubscription.currentPeriodEnd instanceof Date
              ? activeSubscription.currentPeriodEnd.getTime()
              : Date.parse(String(activeSubscription.currentPeriodEnd)),
          )
        : null

      for (const target of subscriptionTargets()) {
        const lookupKey = resolveLookupKey(target.productId, target.interval)
        if (!lookupKey) continue
        const price = catalog[lookupKey]
        // 没配价或不是订阅的目标不给：点了必然失败。
        if (!price?.recurring) continue

        const direction = resolveSwitchDirection({
          current: {
            kind: 'subscription',
            id: activeSubscription.id,
            subscriptionId: activeSubscription.subscriptionId ?? null,
            status: activeSubscription.status,
            productId: activeSubscription.productId ?? null,
            stripeProductId: activeSubscription.stripeProductId ?? null,
            amount: activeSubscription.amount,
            currency: activeSubscription.currency,
            interval: activeSubscription.interval,
          },
          target: {
            productId: target.productId,
            stripeProductId: price.stripeProductId,
            amount: price.amount,
            currency: price.currency,
            interval: target.interval,
          },
          context,
        })

        switchTargets.push({
          productId: target.productId,
          interval: target.interval,
          priceId: price.priceId,
          amount: price.amount,
          currency: price.currency,
          direction,
          isCurrent: price.priceId === activeSubscription.priceId,
          // 降级期末生效：告诉用户「从什么时候开始按新价付」。
          effectiveAt:
            direction === 'downgrade' && periodEnd && !Number.isNaN(periodEnd.getTime())
              ? periodEnd.toISOString()
              : null,
        })
      }
    }

    // 已安排的变更（降级）：只在**当前那份**订阅上。
    // pending 列不在对外的记录类型里（那是内部状态），直接从原始行取。
    const activeRow = subscriptions.find((row) => row.id === activeSubscription?.id)
    const pendingChange: PendingChange | null =
      activeRow?.pendingPriceId && activeRow.pendingProductId
        ? {
            productId: activeRow.pendingProductId,
            interval: (activeRow.pendingInterval ?? 'month') as PendingChange['interval'],
            amount: activeRow.pendingAmount ?? 0,
            currency: activeRow.pendingCurrency ?? 'usd',
            effectiveAt: toIsoString(activeRow.pendingEffectiveAt),
          }
        : null

    return {
      subscriptions: subscriptionRecords.map((sub) => ({
        ...sub,
        isCurrent: currentIds.has(sub.id),
        superseded: supersededIds.has(sub.id),
        pending: sub.id === activeSubscription?.id && pendingChange ? pendingChange : null,
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
            tier: context.tiersByProductId?.[current.productId ?? ''] ?? null,
          }
        : null,
      switchTargets,
      pendingChange,
    }
  })

/**
 * 当前订阅（定价页用）。
 *
 * 定价页要知道「这个人是不是已经有订阅」：有订阅时付费档位的按钮是「切换到 X」而不是
 * 「购买」。**匿名不查库**——没有会话就没有订阅，查了也是白查。
 */
export const fetchCurrentPlan = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    productId: string | null
    interval: string | null
    priceId: string | null
  } | null> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    if (!session) return null

    const { eq } = await import('drizzle-orm')
    const { createDb, schema } = await import('@/db')
    const db = createDb(env.DB)

    const rows = await db
      .select({
        productId: schema.subscriptions.productId,
        priceId: schema.subscriptions.priceId,
        interval: schema.subscriptions.interval,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, session.user.id))
      .limit(10)

    const { isActiveSubscriptionStatus } = await import('./plan-state')
    const active = rows.filter((row) => isActiveSubscriptionStatus(row.status))
    // 多份活跃订阅时不猜：定价页退回「购买」，真正的问题交给账单页与门户。
    if (active.length !== 1) return null
    const row = active[0]
    if (!row) return null
    return {
      productId: row.productId ?? null,
      interval: row.interval ?? null,
      priceId: row.priceId ?? null,
    }
  },
)
