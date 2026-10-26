import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * webhook 对「待生效变更」（降级）的处理。
 *
 * 降级用 Stripe 的 `proration_behavior: 'none'` 实现：Stripe 上的价格**立刻**变成
 * 新价，而本期已付金额不变——用户此刻仍在按旧价扣款。若照单全收 Stripe 的
 * `customer.subscription.updated`，本地行会显示新（低）价，账单页就会说谎。
 *
 * 约定：**当前列 = 用户此刻正在付的价**，pending 列 = 周期末要切到的。晋升有两条
 * 入口（续费发票付清、周期翻页），互为兜底，事件顺序无关。
 */

const mockProvider = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
}))

vi.mock('@/payment', () => ({
  getPaymentProvider: vi.fn().mockReturnValue(mockProvider),
}))

vi.mock('@/payment/price-catalog.server', () => ({
  findProductIdByPriceId: async (priceId: string) =>
    priceId === 'price_life' ? 'lifetime' : 'pro',
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
    userId: makeCol('subscriptions.user_id'),
    subscriptionId: makeCol('subscriptions.subscription_id'),
    status: makeCol('subscriptions.status'),
    priceId: makeCol('subscriptions.price_id'),
    productId: makeCol('subscriptions.product_id'),
    stripeProductId: makeCol('subscriptions.stripe_product_id'),
    amount: makeCol('subscriptions.amount'),
    currency: makeCol('subscriptions.currency'),
    interval: makeCol('subscriptions.interval'),
    currentPeriodStart: makeCol('subscriptions.current_period_start'),
    currentPeriodEnd: makeCol('subscriptions.current_period_end'),
    cancelAtPeriodEnd: makeCol('subscriptions.cancel_at_period_end'),
    pendingPriceId: makeCol('subscriptions.pending_price_id'),
    pendingProductId: makeCol('subscriptions.pending_product_id'),
    pendingStripeProductId: makeCol('subscriptions.pending_stripe_product_id'),
    pendingInterval: makeCol('subscriptions.pending_interval'),
    pendingAmount: makeCol('subscriptions.pending_amount'),
    pendingCurrency: makeCol('subscriptions.pending_currency'),
    pendingEffectiveAt: makeCol('subscriptions.pending_effective_at'),
    createdAt: makeCol('subscriptions.created_at'),
  },
  payments: {
    id: makeCol('payments.id'),
    userId: makeCol('payments.user_id'),
    type: makeCol('payments.type'),
    productId: makeCol('payments.product_id'),
    stripeProductId: makeCol('payments.stripe_product_id'),
    createdAt: makeCol('payments.created_at'),
  },
  users: { id: makeCol('users.id') },
  webhookEvents: { id: makeCol('webhook_events.id') },
}

const makeSelectChain = (resolvedRows: unknown[]) => {
  const whereResult = Object.assign(Promise.resolve(resolvedRows), {
    limit: vi.fn().mockResolvedValue(resolvedRows),
  })
  const whereMock = vi.fn().mockReturnValue(whereResult)
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  return vi.fn().mockReturnValue({ from: fromMock })
}

/** 捕获本地写入（`db.update(...).set(...)`）与付款行（`db.insert(...).values(...)`）。 */
const capturedUpdates: Array<Record<string, unknown>> = []
const capturedPayments: Array<Record<string, unknown>> = []

const mockDb = {
  select: vi.fn(),
  update: vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      capturedUpdates.push(values)
      return { where: vi.fn().mockResolvedValue([]) }
    }),
  })),
  insert: vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      capturedPayments.push(values)
      return {
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }
    }),
  })),
}

vi.mock('@/db', () => ({
  createDb: vi.fn().mockReturnValue(mockDb),
  schema: mockSchema,
}))

/** 当前订阅行：正按 pro 月付付费，已安排降级到年付。 */
function pendingSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    userId: 'user_1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'active',
    priceId: 'price_month',
    pendingPriceId: 'price_year',
    pendingProductId: 'pro',
    pendingStripeProductId: 'prod_pro',
    pendingInterval: 'year',
    pendingAmount: 9900,
    pendingCurrency: 'usd',
    pendingEffectiveAt: new Date('2026-01-31T00:00:00Z'),
    ...overrides,
  }
}

describe('webhook · 待生效变更（降级）', () => {
  let subscriptionRows: unknown[] = []
  let stripePriceId: string | null = null

  beforeEach(() => {
    capturedUpdates.length = 0
    capturedPayments.length = 0
    subscriptionRows = [pendingSubscription()]
    stripePriceId = null

    mockProvider.retrieveSubscription.mockReset()
    mockProvider.retrieveSubscription.mockImplementation(async () => ({
      id: 'sub_1',
      itemId: 'si_1',
      priceId: stripePriceId ?? 'price_year',
      amount: 990,
      currency: 'usd',
      interval: 'month',
      currentPeriodEnd: 1767225600,
      status: 'active',
    }))

    mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
      const first = fields ? Object.values(fields)[0] : undefined
      const name = (first as { name?: string } | undefined)?.name
      const rows = name === 'subscriptions.id' ? subscriptionRows : []
      return makeSelectChain(rows)()
    })
    mockDb.update.mockClear()
  })

  /** 构造一个 `customer.subscription.updated` 事件。 */
  function subscriptionEvent(options: { priceId: string; periodStart: number; periodEnd: number }) {
    return {
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { userId: 'user_1', productId: 'pro' },
      customer: 'cus_1',
      items: {
        data: [
          {
            price: {
              id: options.priceId,
              currency: 'usd',
              recurring: { interval: 'month' },
              unit_amount: 990,
              product: 'prod_pro',
            },
            current_period_start: options.periodStart,
            current_period_end: options.periodEnd,
          },
        ],
      },
    }
  }

  it('周期未翻：不写价格列、不清 pending，只写状态类字段', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')

    await handleSubscriptionUpsert(
      mockDb as never,
      subscriptionEvent({
        priceId: 'price_year',
        // 周期起点仍是当前周期（小于生效时刻）。
        periodStart: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000),
        periodEnd: Math.floor(new Date('2026-01-31T00:00:00Z').getTime() / 1000),
      }),
    )

    const written = capturedUpdates[capturedUpdates.length - 1]
    // 价格列不能被新价覆盖：用户此刻还在按旧价扣款。
    expect(written).not.toHaveProperty('priceId')
    expect(written?.pendingPriceId).toBeUndefined()
    expect(written?.status).toBe('active')
  })

  it('周期已翻：晋升——pending 写成当前值并清空 pending', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')

    await handleSubscriptionUpsert(
      mockDb as never,
      subscriptionEvent({
        priceId: 'price_year',
        // 周期起点已到生效时刻：降级生效。
        periodStart: Math.floor(new Date('2026-01-31T00:00:00Z').getTime() / 1000),
        periodEnd: Math.floor(new Date('2026-02-28T00:00:00Z').getTime() / 1000),
      }),
    )

    const written = capturedUpdates[capturedUpdates.length - 1]
    expect(written).toMatchObject({
      priceId: 'price_year',
      productId: 'pro',
      interval: 'year',
      amount: 9900,
      currency: 'usd',
      pendingPriceId: null,
      pendingProductId: null,
      pendingInterval: null,
      pendingEffectiveAt: null,
    })
  })

  it('事件带来别的价：pending 被新切换取代，清 pending 并写新价', async () => {
    stripePriceId = 'price_other'
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')

    await handleSubscriptionUpsert(
      mockDb as never,
      subscriptionEvent({
        priceId: 'price_other',
        periodStart: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000),
        periodEnd: Math.floor(new Date('2026-01-31T00:00:00Z').getTime() / 1000),
      }),
    )

    const written = capturedUpdates[capturedUpdates.length - 1]
    expect(written).toMatchObject({
      priceId: 'price_other',
      pendingPriceId: null,
    })
  })

  it('过时的旧事件不改价格：只写状态类字段', async () => {
    // Stripe 上早已是别的价，这个事件是迟到的旧事件。
    stripePriceId = 'price_new'
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')

    await handleSubscriptionUpsert(
      mockDb as never,
      subscriptionEvent({
        priceId: 'price_year',
        periodStart: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000),
        periodEnd: Math.floor(new Date('2026-01-31T00:00:00Z').getTime() / 1000),
      }),
    )

    const written = capturedUpdates[capturedUpdates.length - 1]
    expect(written).not.toHaveProperty('priceId')
    expect(written?.status).toBe('active')
  })
})

describe('webhook · invoice.paid 的晋升与折算记账', () => {
  beforeEach(() => {
    capturedUpdates.length = 0
    capturedPayments.length = 0

    mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
      const first = fields ? Object.values(fields)[0] : undefined
      const name = (first as { name?: string } | undefined)?.name
      const rows = name === 'subscriptions.id' ? [pendingSubscription()] : []
      return makeSelectChain(rows)()
    })
  })

  function invoiceEvent(options: { priceId: string; amountPaid: number; billingReason?: string }) {
    return {
      id: 'evt_invoice',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          amount_paid: options.amountPaid,
          currency: 'usd',
          created: 1767225600,
          ...(options.billingReason ? { billing_reason: options.billingReason } : {}),
          parent: { subscription_details: { subscription: 'sub_1' } },
          payments: { data: [{ payment: { charge: 'ch_1' } }] },
          lines: {
            data: [
              {
                amount: options.amountPaid,
                currency: 'usd',
                pricing: { price_details: { price: options.priceId, product: 'prod_pro' } },
              },
            ],
          },
        },
      },
    }
  }

  it('发票的价就是待生效的价：立即晋升', async () => {
    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')

    await handleInvoicePaid(
      mockDb as never,
      invoiceEvent({
        priceId: 'price_year',
        amountPaid: 9900,
        billingReason: 'subscription_cycle',
      }),
    )

    const written = capturedUpdates[capturedUpdates.length - 1]
    expect(written).toMatchObject({
      priceId: 'price_year',
      productId: 'pro',
      interval: 'year',
      pendingPriceId: null,
    })
  })

  it('发票的价与待生效的价不同：不晋升', async () => {
    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')

    await handleInvoicePaid(
      mockDb as never,
      invoiceEvent({
        priceId: 'price_month',
        amountPaid: 990,
        billingReason: 'subscription_cycle',
      }),
    )

    expect(capturedUpdates).toHaveLength(0)
  })

  it('折算发票（subscription_change）写 payments.type = proration，金额保留带符号', async () => {
    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')

    await handleInvoicePaid(
      mockDb as never,
      // 升级的折算发票：金额可以是负数（抵扣）。
      invoiceEvent({
        priceId: 'price_year',
        amountPaid: -1500,
        billingReason: 'subscription_change',
      }),
    )

    const payment = capturedPayments[capturedPayments.length - 1]
    expect(payment?.type).toBe('proration')
    // 带符号：负数就是抵扣，不能取绝对值。
    expect(payment?.amount).toBe(-1500)
  })
})
