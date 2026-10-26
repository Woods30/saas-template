import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 切换方案（`POST /api/payment/switch`）的单元测试。
 *
 * 切换改的是**现有那份订阅的价格**（Stripe 的订阅更新），不是新开一份——两份订阅
 * 就是两份扣款。这里钉死三件最容易出错的事：
 *
 * 1. 换价必须带**订阅项 id**：漏了 Stripe 会新增一个订阅项，两个价格同时生效；
 * 2. 升级用 `always_invoice`（立刻按差额扣款），降级用 `none`（期末生效，不退款）；
 * 3. 降级要**先写 pending 再调 Stripe**，Stripe 失败必须清掉 pending（补偿），
 *    否则本地会留下一个「已安排但其实没安排」的变更。
 */

// 价格目录替身：服务端按 lookup key 解析出的 Price。
const mockPriceCatalog = {
  pro_monthly: {
    priceId: 'price_month',
    amount: 990,
    currency: 'usd',
    recurring: true,
    stripeProductId: 'prod_pro',
  },
  pro_yearly: {
    priceId: 'price_year',
    amount: 9900,
    currency: 'usd',
    recurring: true,
    stripeProductId: 'prod_pro',
  },
  // 更高档位的产品：用来测「升级 / 降级」两个方向（默认配置里只有一个订阅档位）。
  pro_plus_monthly: {
    priceId: 'price_plus',
    amount: 2990,
    currency: 'usd',
    recurring: true,
    stripeProductId: 'prod_pro_plus',
  },
  pro_max_monthly: {
    priceId: 'price_max',
    amount: 4990,
    currency: 'usd',
    recurring: true,
    stripeProductId: 'prod_pro_max',
  },
  lifetime: {
    priceId: 'price_life',
    amount: 9900,
    currency: 'usd',
    recurring: false,
    stripeProductId: 'prod_lifetime',
  },
}

/** Stripe provider 替身：切换路径只用到这两个方法。 */
const mockProvider = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  updateSubscriptionPrice: vi.fn(),
}))

vi.mock('@/payment', () => ({
  getPaymentProvider: vi.fn().mockReturnValue(mockProvider),
}))

const makeCol = (name: string) =>
  ({
    get name() {
      return name
    },
  }) as unknown as { name: string }

const mockSchema = {
  subscriptions: {
    id: makeCol('subscriptions.id'),
    subscriptionId: makeCol('subscriptions.subscription_id'),
    status: makeCol('subscriptions.status'),
    priceId: makeCol('subscriptions.price_id'),
    productId: makeCol('subscriptions.product_id'),
    stripeProductId: makeCol('subscriptions.stripe_product_id'),
    amount: makeCol('subscriptions.amount'),
    currency: makeCol('subscriptions.currency'),
    interval: makeCol('subscriptions.interval'),
    currentPeriodEnd: makeCol('subscriptions.current_period_end'),
    pendingPriceId: makeCol('subscriptions.pending_price_id'),
    pendingProductId: makeCol('subscriptions.pending_product_id'),
    pendingStripeProductId: makeCol('subscriptions.pending_stripe_product_id'),
    pendingInterval: makeCol('subscriptions.pending_interval'),
    pendingAmount: makeCol('subscriptions.pending_amount'),
    pendingCurrency: makeCol('subscriptions.pending_currency'),
    pendingEffectiveAt: makeCol('subscriptions.pending_effective_at'),
  },
  payments: {
    id: makeCol('payments.id'),
    productId: makeCol('payments.product_id'),
    stripeProductId: makeCol('payments.stripe_product_id'),
  },
}

/** `select().from().where()` 的可链式替身：`where` 的结果既能 await 也能 `.limit()`。 */
const makeSelectChain = (resolvedRows: unknown[]) => {
  const whereResult = Object.assign(Promise.resolve(resolvedRows), {
    limit: vi.fn().mockResolvedValue(resolvedRows),
  })
  const whereMock = vi.fn().mockReturnValue(whereResult)
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  return vi.fn().mockReturnValue({ from: fromMock })
}

/** 捕获本地写入（`db.update(...).set(...)`）的参数。 */
const capturedUpdates: Array<Record<string, unknown>> = []

const mockDb = {
  select: vi.fn(),
  update: vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      capturedUpdates.push(values)
      return { where: vi.fn().mockResolvedValue([]) }
    }),
  })),
}

vi.mock('@/db', () => ({
  createDb: vi.fn().mockReturnValue(mockDb),
  schema: mockSchema,
}))

/** 账号当前持有的活跃订阅（默认：专业版月付）。 */
function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    subscriptionId: 'sub_stripe_1',
    status: 'active',
    priceId: 'price_month',
    productId: 'pro',
    stripeProductId: 'prod_pro',
    amount: 990,
    currency: 'usd',
    interval: 'month',
    currentPeriodEnd: new Date('2026-01-31T00:00:00Z'),
    pendingPriceId: null,
    pendingProductId: null,
    pendingStripeProductId: null,
    pendingInterval: null,
    pendingAmount: null,
    pendingCurrency: null,
    pendingEffectiveAt: null,
    ...overrides,
  }
}

describe('POST /api/payment/switch', () => {
  let subscriptionRows: unknown[] = []
  let purchaseRows: unknown[] = []
  let rateLimited = false
  let authenticated = true

  beforeEach(() => {
    capturedUpdates.length = 0
    subscriptionRows = [activeSubscription()]
    purchaseRows = []
    rateLimited = false
    authenticated = true

    mockProvider.retrieveSubscription.mockReset()
    mockProvider.retrieveSubscription.mockResolvedValue({
      id: 'sub_stripe_1',
      itemId: 'si_123',
      priceId: 'price_month',
      amount: 990,
      currency: 'usd',
      interval: 'month',
      currentPeriodEnd: 1767225600,
      status: 'active',
    })
    mockProvider.updateSubscriptionPrice.mockReset()
    mockProvider.updateSubscriptionPrice.mockResolvedValue({ id: 'sub_stripe_1' })

    mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
      const first = fields ? Object.values(fields)[0] : undefined
      const name = (first as { name?: string } | undefined)?.name
      const rows =
        name === 'subscriptions.id'
          ? subscriptionRows
          : name === 'payments.product_id'
            ? purchaseRows
            : []
      return makeSelectChain(rows)()
    })

    vi.doUnmock('@/config/website')
    vi.doUnmock('@/auth/auth')
    vi.doUnmock('@/lib/rate-limit')
    vi.resetModules()

    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({
        env: { STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test' },
      }),
      als: {
        getStore: () => ({
          paymentProviderRegistry: {},
          mailProviderRegistry: {},
          notificationProviderRegistry: {},
        }),
      },
    }))
    vi.doMock('@/auth/auth', () => ({
      getAuth: () => ({
        api: {
          getSession: async () =>
            authenticated ? { user: { id: 'user_1', email: 'a@example.com' } } : null,
        },
      }),
    }))
    vi.doMock('@/lib/rate-limit', () => ({
      checkRateLimit: async () => !rateLimited,
    }))
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }),
      )
      return { ...actual, websiteConfig: base }
    })
    vi.doMock('@/payment/price-catalog.server', () => ({
      getPriceCatalog: async () => mockPriceCatalog,
    }))
    // 产品配置：默认配置里只有一个订阅档位，补一个更高档位才能测出「升级 / 降级」。
    vi.doMock('@/config/products', async () => {
      const actual = await vi.importActual<typeof import('@/config/products')>('@/config/products')
      return {
        ...actual,
        productTierMap: () => ({ free: 0, pro: 1, pro_plus: 2, pro_max: 3, lifetime: 4 }),
        productExclusivityMap: () => ({}),
        resolveLookupKey: (productId: string, interval?: string) => {
          if (productId === 'pro_plus' && interval === 'month') return 'pro_plus_monthly'
          if (productId === 'pro_max' && interval === 'month') return 'pro_max_monthly'
          return actual.resolveLookupKey(productId, interval as never)
        },
      }
    })
  })

  async function importRoute() {
    const { Route } = await import('@/routes/api/payment/switch')
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    return handlers.POST as (ctx: { request: Request }) => Promise<Response>
  }

  async function callSwitch(body: unknown) {
    const handler = await importRoute()
    const request = new Request('https://jerbix.dev/api/payment/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return handler({ request })
  }

  it('未登录返回 401，不查库也不调 Stripe', async () => {
    authenticated = false
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(401)
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
    expect(capturedUpdates).toHaveLength(0)
  })

  it('目标没配价返回 400 PRICE_NOT_CONFIGURED', async () => {
    const response = await callSwitch({ productId: 'not_a_product', interval: 'month' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'PRICE_NOT_CONFIGURED' })
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
  })

  it('目标是买断（一次性）返回 400 NOT_A_SUBSCRIPTION', async () => {
    const response = await callSwitch({ productId: 'lifetime', interval: 'one_time' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'NOT_A_SUBSCRIPTION' })
  })

  it('没有活跃订阅返回 409 NO_ACTIVE_SUBSCRIPTION', async () => {
    subscriptionRows = []
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'NO_ACTIVE_SUBSCRIPTION' })
  })

  it('多份活跃订阅返回 409，不动订阅', async () => {
    subscriptionRows = [activeSubscription(), activeSubscription({ id: 'sub_2' })]
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'MULTIPLE_ACTIVE_SUBSCRIPTIONS' })
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
  })

  it('持有更高等级的买断时返回 409，不动订阅', async () => {
    purchaseRows = [{ productId: 'lifetime', stripeProductId: 'prod_lifetime' }]
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'ALREADY_OWNED_HIGHER_TIER' })
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
  })

  it('限流命中返回 429', async () => {
    rateLimited = true
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(429)
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
  })

  it('目标价就是当前价且没有待生效变更时返回 unchanged，不调 Stripe', async () => {
    const response = await callSwitch({ productId: 'pro', interval: 'month' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('unchanged')
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
    expect(capturedUpdates).toHaveLength(0)
  })

  it('升级：立刻按差额结算，换价必须带订阅项 id', async () => {
    const response = await callSwitch({ productId: 'pro_plus', interval: 'month' })

    expect(response.status).toBe(200)
    expect(((await response.json()) as Record<string, unknown>).status).toBe('switched')
    expect(mockProvider.updateSubscriptionPrice).toHaveBeenCalledTimes(1)
    const call = mockProvider.updateSubscriptionPrice.mock.calls[0]?.[0]
    expect(call).toMatchObject({
      subscriptionId: 'sub_stripe_1',
      // 漏掉 itemId，Stripe 会**新增**一个订阅项而不是替换：两个价格同时扣款。
      itemId: 'si_123',
      priceId: 'price_plus',
      prorationBehavior: 'always_invoice',
    })
    // 本地行就地更新：价格列换成新价，pending 清空。
    expect(capturedUpdates[capturedUpdates.length - 1]).toMatchObject({
      priceId: 'price_plus',
      productId: 'pro_plus',
      pendingPriceId: null,
    })
  })

  it('同档换周期：立即生效，用 always_invoice', async () => {
    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('switched')
    expect(body.direction).toBe('change')
    expect(mockProvider.updateSubscriptionPrice).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_year', prorationBehavior: 'always_invoice' }),
    )
  })

  it('降级：先写 pending，再按 none 调 Stripe（本期金额不变）', async () => {
    subscriptionRows = [activeSubscription({ productId: 'pro_plus', priceId: 'price_plus' })]
    mockProvider.retrieveSubscription.mockResolvedValue({
      id: 'sub_stripe_1',
      itemId: 'si_123',
      priceId: 'price_plus',
      amount: 2990,
      currency: 'usd',
      interval: 'month',
      currentPeriodEnd: 1767225600,
      status: 'active',
    })

    const response = await callSwitch({ productId: 'pro', interval: 'month' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('scheduled')
    expect(body.direction).toBe('downgrade')
    // 先写 pending（写前意图），再调 Stripe。
    expect(capturedUpdates[0]).toMatchObject({
      pendingPriceId: 'price_month',
      pendingProductId: 'pro',
      pendingInterval: 'month',
    })
    expect(mockProvider.updateSubscriptionPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_month',
        // `none` = 不产生折算：本期已付金额不变，新价从下一张账单起算。
        prorationBehavior: 'none',
      }),
    )
  })

  it('降级时 Stripe 失败：清掉 pending（补偿），返回 502 且本地回到干净状态', async () => {
    subscriptionRows = [activeSubscription({ productId: 'pro_plus', priceId: 'price_plus' })]
    mockProvider.updateSubscriptionPrice.mockRejectedValue(new Error('stripe down'))

    const response = await callSwitch({ productId: 'pro', interval: 'month' })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'STRIPE_ERROR' })
    // 补偿：清空 pending。
    expect(capturedUpdates[capturedUpdates.length - 1]).toMatchObject({
      pendingPriceId: null,
      pendingProductId: null,
    })
  })

  it('待生效的目标就是本次目标时返回 scheduled，不调 Stripe', async () => {
    subscriptionRows = [
      activeSubscription({
        pendingPriceId: 'price_year',
        pendingProductId: 'pro',
        pendingInterval: 'year',
        pendingAmount: 9900,
        pendingCurrency: 'usd',
        pendingEffectiveAt: new Date('2026-01-31T00:00:00Z'),
      }),
    ]

    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('scheduled')
    expect(mockProvider.updateSubscriptionPrice).not.toHaveBeenCalled()
  })

  it('取消已安排的降级：恢复 Stripe 上的价格并清 pending', async () => {
    subscriptionRows = [
      activeSubscription({
        pendingPriceId: 'price_year',
        pendingProductId: 'pro',
        pendingInterval: 'year',
        pendingAmount: 9900,
        pendingCurrency: 'usd',
        pendingEffectiveAt: new Date('2026-01-31T00:00:00Z'),
      }),
    ]

    const response = await callSwitch({ productId: 'pro', interval: 'month' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('unchanged')
    expect(body.pendingCancelled).toBe(true)
    // 恢复必须把 Stripe 的价格拉回用户实付的档位，否则周期末会按低价续费。
    expect(mockProvider.updateSubscriptionPrice).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_month', prorationBehavior: 'none' }),
    )
    expect(capturedUpdates[capturedUpdates.length - 1]).toMatchObject({ pendingPriceId: null })
  })

  it('降级后立刻升级：先恢复再应用，两次 Stripe 调用', async () => {
    // 现状：正按 pro_plus 付费（周期内已付高价），但已安排降级到 pro（pending）。
    // 此时用户改主意要升到更高的 pro_max。
    subscriptionRows = [
      activeSubscription({
        productId: 'pro_plus',
        priceId: 'price_plus',
        amount: 2990,
        pendingPriceId: 'price_month',
        pendingProductId: 'pro',
        pendingInterval: 'month',
        pendingAmount: 990,
        pendingCurrency: 'usd',
        pendingEffectiveAt: new Date('2026-01-31T00:00:00Z'),
      }),
    ]

    const response = await callSwitch({ productId: 'pro_max', interval: 'month' })

    expect(response.status).toBe(200)
    expect(mockProvider.updateSubscriptionPrice).toHaveBeenCalledTimes(2)
    const [restore, apply] = mockProvider.updateSubscriptionPrice.mock.calls.map(
      (call) => call[0] as { priceId: string; prorationBehavior: string },
    )
    // 第一步：把 Stripe 的价格恢复成用户实付的档位（不动钱）——
    // 否则第二步的折算基准是那个低价，升级会少收钱。
    expect(restore).toMatchObject({ priceId: 'price_plus', prorationBehavior: 'none' })
    expect(apply).toMatchObject({ priceId: 'price_max', prorationBehavior: 'always_invoice' })
  })

  it('Stripe 调用失败时返回 502，且本地状态不变', async () => {
    mockProvider.updateSubscriptionPrice.mockRejectedValue(new Error('stripe down'))

    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'STRIPE_ERROR' })
    // 升级路径「先调 Stripe 再写本地」：Stripe 失败就不写本地。
    expect(capturedUpdates).toHaveLength(0)
  })

  it('读订阅失败（订阅已不存在）返回 409 SUBSCRIPTION_NOT_FOUND', async () => {
    mockProvider.retrieveSubscription.mockRejectedValue(
      Object.assign(new Error('No such subscription'), { code: 'resource_missing' }),
    )

    const response = await callSwitch({ productId: 'pro', interval: 'year' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'SUBSCRIPTION_NOT_FOUND' })
  })
})
