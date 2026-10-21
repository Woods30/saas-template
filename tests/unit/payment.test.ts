import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '@/env/server'
import { buildPaymentProviderRegistry } from '@/payment'

// Stripe mock —— 必须 hoist，早于 vi.mock('@/payment') 求值。

const mockStripeInstance = vi.hoisted(() => ({
  createFetchHttpClient: vi.fn().mockReturnValue({}),
  createSubtleCryptoProvider: vi.fn().mockReturnValue({}),
  sessionsCreate: vi.fn().mockResolvedValue({
    id: 'cs_test_session',
    url: 'https://checkout.stripe.com/test',
  }),
  portalCreate: vi.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/portal',
  }),
  constructEventAsync: vi.fn().mockResolvedValue({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: { object: {} },
  }),
}))

vi.mock('stripe', () => ({
  default: class MockStripe {
    static createFetchHttpClient = mockStripeInstance.createFetchHttpClient
    static createSubtleCryptoProvider = mockStripeInstance.createSubtleCryptoProvider
    checkout = { sessions: { create: mockStripeInstance.sessionsCreate } }
    billingPortal = { sessions: { create: mockStripeInstance.portalCreate } }
    webhooks = { constructEventAsync: mockStripeInstance.constructEventAsync }
  },
}))

// @/payment mock —— 保留真实导出，只覆盖 getPaymentProvider。

const mockCheckoutProvider = vi.hoisted(() => ({
  createCheckoutSession: vi
    .fn()
    .mockResolvedValue({ url: 'https://checkout.stripe.com/test', sessionId: 'cs_123' }),
  createCustomerPortalLink: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/portal' }),
}))

vi.mock('@/payment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/payment')>()
  return {
    ...actual,
    getPaymentProvider: vi.fn().mockReturnValue(mockCheckoutProvider),
  }
})

// @/db mock —— 供 webhook handler 用例使用。

// 捕获 insert 入参供断言。
const captured = {
  checkoutValues: null as Record<string, unknown> | null,
  invoiceValues: null as Record<string, unknown> | null,
}

const mockInsertFns = vi.hoisted(() => ({
  checkout: vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      captured.checkoutValues = v
      return {
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }
    }),
  }),
  invoicePaid: vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      captured.invoiceValues = v
      return {
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }
    }),
  }),
}))

const _mockSelectFns = vi.hoisted(() => ({
  userFound: vi.fn(),
  userNotFound: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
    }),
  }),
  subFound: vi.fn(),
}))

const makeCol = (name: string) =>
  ({
    get name() {
      return name
    },
  }) as unknown as { name: string }

// 真实 drizzle schema 是带属性链的类实例，这里用普通对象模拟同样的访问方式。
const mockSchema = {
  users: { id: makeCol('users.id') },
  subscriptions: {
    id: makeCol('subscriptions.id'),
    userId: makeCol('subscriptions.userId'),
    customerId: makeCol('subscriptions.customerId'),
    subscriptionId: makeCol('subscriptions.subscriptionId'),
    status: makeCol('subscriptions.status'),
  },
  payments: {
    id: makeCol('payments.id'),
    chargeId: makeCol('payments.charge_id'),
    invoiceId: makeCol('payments.invoice_id'),
    userId: makeCol('payments.user_id'),
  },
  webhookEvents: { id: makeCol('webhook_events.id') },
}

// select().from().where().limit() 的可链式替身。
const makeSelectChain = (resolvedRows: unknown[]) => {
  const whereMock = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(resolvedRows),
  })
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })
  return { selectMock, whereMock, fromMock }
}

// 稳定的 mockDb 实例，用例自行配置链式返回值。
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi
    .fn()
    .mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
}

vi.mock('@/db', () => ({
  createDb: vi.fn().mockReturnValue(mockDb),
  schema: mockSchema,
}))

describe('StripePaymentProvider', () => {
  it('createCheckoutSession calls stripe.checkout.sessions.create with correct params', async () => {
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const result = await provider.createCheckoutSession({
      priceId: 'price_123',
      userId: 'user_456',
      customerEmail: 'test@example.com',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      locale: 'en',
      mode: 'subscription',
    })

    expect(result.url).toBe('https://checkout.stripe.com/test')
    expect(result.sessionId).toBe('cs_test_session')
  })

  it('createCheckoutSession returns url and sessionId', async () => {
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const result = await provider.createCheckoutSession({
      priceId: 'price_123',
      userId: 'user_456',
      customerEmail: 'test@example.com',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      mode: 'payment',
    })

    expect(result).toHaveProperty('url')
    expect(result).toHaveProperty('sessionId')
  })

  it('createCustomerPortalLink calls stripe.billingPortal.sessions.create with correct params', async () => {
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const result = await provider.createCustomerPortalLink({
      customerId: 'cus_123',
      returnUrl: 'https://app.example.com/account',
    })

    expect(result.url).toBe('https://billing.stripe.com/portal')
  })

  it('verifyWebhook returns true for valid signature', async () => {
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const valid = await provider.verifyWebhook('{}', 'sig_valid')
    expect(valid).toBe(true)
  })

  it('verifyWebhook returns false for invalid signature', async () => {
    mockStripeInstance.constructEventAsync = vi
      .fn()
      .mockRejectedValue(new Error('Invalid signature'))
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const valid = await provider.verifyWebhook('{}', 'sig_invalid')
    expect(valid).toBe(false)
    // 复原，避免影响后续用例。
    mockStripeInstance.constructEventAsync = vi.fn().mockResolvedValue({
      id: 'evt_test',
      type: 'checkout.session.completed',
      data: { object: {} },
    })
  })
})

describe('buildPaymentProviderRegistry', () => {
  it('missing env returns stripe as undefined', () => {
    const registry = buildPaymentProviderRegistry(parseServerEnv({}))
    expect(registry.stripe).toBeUndefined()
  })

  it('complete env returns stripe factory', () => {
    const registry = buildPaymentProviderRegistry(
      parseServerEnv({
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      }),
    )
    expect(typeof registry.stripe).toBe('function')
  })
})

describe('getPaymentProvider', () => {
  it('getPaymentProvider is callable via the mock', async () => {
    const { getPaymentProvider: gp } = await import('@/payment')
    expect(() => gp('stripe')).not.toThrow()
  })
})

// POST /api/payment 配置门禁。用例显式关掉开关，不依赖默认值——否则开关调整时断言会静默失效。
describe('POST /api/payment 门禁', () => {
  beforeEach(() => {
    // `vi.doMock` 的替身会跨用例残留，每个用例从真实配置重新开始。
    vi.doUnmock('@/config/website')
    vi.resetModules()
  })

  function getHandler(method: 'POST' | 'DELETE') {
    return async (route: unknown, request: Request): Promise<Response> => {
      const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
        .options?.server?.handlers
      const handler = handlers?.[method]
      if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
      return (handler as (ctx: { request: Request }) => Promise<Response>)({ request })
    }
  }

  /** 以 `payment.enabled: false` 重新加载路由。 */
  async function importRouteWithPaymentDisabled() {
    vi.resetModules()
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }),
      )
      return { ...actual, websiteConfig: { ...base, payment: { ...base.payment, enabled: false } } }
    })
    return import('@/routes/api/payment/$')
  }

  it('payment 关闭时 POST 返回 404，且不调用 auth / rate-limit / provider', async () => {
    const { Route } = await importRouteWithPaymentDisabled()
    const request = new Request('https://jerbix.dev/api/payment/checkout', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')

    const response = await getHandler('POST')(Route, request)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(read).not.toHaveBeenCalled()
    expect(mockCheckoutProvider.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('payment 关闭时 DELETE 返回 404', async () => {
    const { Route } = await importRouteWithPaymentDisabled()
    const request = new Request('https://jerbix.dev/api/payment/portal', {
      method: 'DELETE',
      body: '{}',
    })

    const response = await getHandler('DELETE')(Route, request)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(mockCheckoutProvider.createCustomerPortalLink).not.toHaveBeenCalled()
  })
})

// 重复订阅守卫：重复购买会产生两条并存订阅、两边同时扣款，故创建 session 前查库，命中即 409。
describe('POST /api/payment 重复订阅守卫', () => {
  beforeEach(() => {
    // 三个替身都要清：`@/config/website` 残留着门禁用例的 `payment.enabled: false`，
    // 不清理的话这里会返回 404 而不是 200 / 409。
    vi.doUnmock('@/config/website')
    vi.doUnmock('@/auth/auth')
    vi.doUnmock('@/lib/rate-limit')
    vi.resetModules()
  })

  /** 已登录用户 + 限流放行，两个返回同时控制（命中 / 未命中已有订阅）。 */
  async function importPostRoute(subscriptionRows: unknown[]) {
    // 单测 env 没有 `STRIPE_SECRET_KEY`，不注入的话 payment 被判 incomplete 而返回 503。
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
      getAuth: () => ({ api: { getSession: async () => ({ user: { id: 'user_1' } }) } }),
    }))
    // 必须配齐 Price：`allowedPriceIds` 为空时会放行任意 priceId，白名单分支就测不到。
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({
          VITE_BASE_URL: 'https://jerbix.dev',
          VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_month',
          VITE_STRIPE_PRICE_PRO_YEARLY: 'price_year',
          VITE_STRIPE_PRICE_LIFETIME: 'price_life',
        }),
      )
      return { ...actual, websiteConfig: base }
    })
    // 同源校验以 `publicEnv.VITE_BASE_URL` 为准，必须与上面的站点一致。
    vi.doMock('@/env/public', async () => {
      const actual = await vi.importActual<typeof import('@/env/public')>('@/env/public')
      return { ...actual, publicEnv: { ...actual.publicEnv, VITE_BASE_URL: 'https://jerbix.dev' } }
    })
    vi.doMock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true }))
    // 只劫持 subscriptions 查询；返回值必须是完整的链，路由不只用 `selectMock` 本身。
    mockDb.select = vi.fn().mockImplementation((fields: Record<string, unknown>) => {
      const first = fields ? Object.values(fields)[0] : undefined
      const name = (first as { name?: string } | undefined)?.name
      return makeSelectChain(name === 'subscriptions.id' ? subscriptionRows : []).selectMock()
    })

    return import('@/routes/api/payment/$')
  }

  const subscribeBody = {
    // 必须落在上面配置的 `allowedPriceIds` 白名单里。
    priceId: 'price_month',
    successUrl: 'https://jerbix.dev/dashboard/billing?checkout=success',
    cancelUrl: 'https://jerbix.dev/pricing?checkout=cancelled',
    mode: 'subscription' as const,
  }

  it('已有 active 订阅时返回 409，且不创建 Checkout Session', async () => {
    const { Route } = await importPostRoute([{ id: 'sub_existing' }])
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.POST as (ctx: { request: Request }) => Promise<Response>

    const request = new Request('https://jerbix.dev/api/payment', {
      method: 'POST',
      body: JSON.stringify(subscribeBody),
    })

    const response = await handler({ request })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'ALREADY_SUBSCRIBED' })
    expect(mockCheckoutProvider.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('没有订阅时照常创建 Checkout Session', async () => {
    const { Route } = await importPostRoute([])
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.POST as (ctx: { request: Request }) => Promise<Response>

    const request = new Request('https://jerbix.dev/api/payment', {
      method: 'POST',
      body: JSON.stringify(subscribeBody),
    })

    const response = await handler({ request })

    expect(response.status).toBe(200)
    expect(mockCheckoutProvider.createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  it('一次性支付不受已有订阅影响（买断没有「已有即重复」）', async () => {
    const { Route } = await importPostRoute([{ id: 'sub_existing' }])
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.POST as (ctx: { request: Request }) => Promise<Response>

    const request = new Request('https://jerbix.dev/api/payment', {
      method: 'POST',
      body: JSON.stringify({ ...subscribeBody, mode: 'payment' }),
    })

    const response = await handler({ request })

    expect(response.status).toBe(200)
    expect(mockCheckoutProvider.createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  // 只挡 `active` 会让「扣款失败但订阅仍在」的用户再买一份。where 条件交给真实
  // SQLite dialect 渲染，状态集合改了就红。
  describe('挡住的状态集合', () => {
    it('同时挡住扣款失败与暂停中的订阅，不挡已结束的', async () => {
      const { Route } = await importPostRoute([])
      const handlers = (
        Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
      ).options.server.handlers
      const handler = handlers.POST as (ctx: { request: Request }) => Promise<Response>

      await handler({
        request: new Request('https://jerbix.dev/api/payment', {
          method: 'POST',
          body: JSON.stringify(subscribeBody),
        }),
      })

      // 取守卫查询的 where 入参：`and(eq(userId), inArray(status, [...]))`。
      const selectResult = mockDb.select.mock.results.at(-1)?.value as {
        from: { mock: { results: Array<{ value: { where: { mock: { calls: unknown[][] } } } }> } }
      }
      const whereMock = selectResult.from.mock.results.at(-1)?.value.where
      const cond = whereMock?.mock.calls.at(-1)?.[0]
      expect(cond, '守卫应带 where 条件').toBeDefined()

      // 真实 dialect 渲染：状态集合改了或写成 `eq(status,'active')` 都会变红。
      const dialect = new SQLiteSyncDialect()
      const rendered = dialect.sqlToQuery(cond as never)
      // 参数顺序：`[userId 列, userId 值, status 列, ...状态值]`。
      const [userIdCol, userIdValue, statusCol, ...statusArgs] = rendered.params as Array<
        { name?: string } | string
      >

      expect(userIdCol).toMatchObject({ name: 'subscriptions.userId' })
      expect(userIdValue).toBe('user_1')
      expect(statusCol).toMatchObject({ name: 'subscriptions.status' })
      expect(statusArgs).toEqual(['active', 'trialing', 'past_due', 'unpaid', 'paused'])
      // 已结束的状态必须在集合外，否则取消过的用户再也订不回来。
      expect(statusArgs).not.toContain('canceled')
      expect(statusArgs).not.toContain('incomplete_expired')
    })
  })
})

describe('createCheckoutSession — Fix 1 (userId from session)', () => {
  it('accepts userId and customerEmail as derived session inputs', async () => {
    mockCheckoutProvider.createCheckoutSession.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/test',
      sessionId: 'cs_123',
    })

    const { createCheckoutSession } = await import('@/routes/api/payment/$')
    const result = await createCheckoutSession({
      priceId: 'price_allowed',
      successUrl: 'https://app.com/success',
      cancelUrl: 'https://app.com/cancel',
      mode: 'subscription',
      locale: 'en',
      userId: 'user_from_session',
      customerEmail: 'session@example.com',
    })

    expect(result.url).toBe('https://checkout.stripe.com/test')
    expect(result.sessionId).toBe('cs_123')
    expect(mockCheckoutProvider.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_from_session',
        customerEmail: 'session@example.com',
      }),
    )
  })
})

describe('handleCheckoutCompleted — Fix 3 (userId validation) + Fix 5 (missing subscription)', () => {
  beforeEach(() => {
    captured.checkoutValues = null
    mockDb.select.mockClear()
    mockInsertFns.checkout.mockClear()
  })

  it('skips INSERT when userId not found in DB', async () => {
    const { whereMock } = makeSelectChain([])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.checkoutValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleCheckoutCompleted } = await import('@/routes/api/webhooks/stripe')
    await handleCheckoutCompleted(mockDb as never, {
      id: 'evt_bad_user',
      data: {
        object: {
          id: 'cs_ghost',
          subscription: 'sub_ghost',
          customer: 'cus_ghost',
          metadata: { userId: 'nonexistent_user' },
        },
      },
    })

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('INSERTs a payment row for one-time purchases (mode: payment has no subscription)', async () => {
    const { whereMock } = makeSelectChain([{ id: 'user_lifetime' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.checkoutValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleCheckoutCompleted } = await import('@/routes/api/webhooks/stripe')
    await handleCheckoutCompleted(mockDb as never, {
      id: 'evt_lifetime',
      data: {
        object: {
          id: 'cs_lifetime',
          mode: 'payment',
          customer: 'cus_lifetime',
          amount_total: 29900,
          currency: 'usd',
          metadata: { userId: 'user_lifetime' },
        },
      },
    })

    // 旧实现没有 subscription 时直接 return，payments.userId 恒为 null，无法判断谁买了终身版。
    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.checkoutValues).toMatchObject({
      id: 'checkout_cs_lifetime',
      userId: 'user_lifetime',
      type: 'one_time',
      status: 'paid',
      amount: 29900,
    })
  })

  it('INSERTs subscription when userId exists and subscription id is present', async () => {
    const { whereMock } = makeSelectChain([{ id: 'user_valid' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.checkoutValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleCheckoutCompleted } = await import('@/routes/api/webhooks/stripe')
    await handleCheckoutCompleted(mockDb as never, {
      id: 'evt_ok',
      data: {
        object: {
          id: 'cs_ok',
          subscription: 'sub_ok',
          customer: 'cus_ok',
          metadata: { userId: 'user_valid' },
        },
      },
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.checkoutValues).toMatchObject({
      id: 'sub_ok',
      userId: 'user_valid',
      status: 'active',
    })
  })
})

describe('handleInvoicePaid — Fix 4 (charge ID + userId lookup)', () => {
  beforeEach(() => {
    captured.invoiceValues = null
    mockDb.select.mockClear()
    mockInsertFns.invoicePaid.mockClear()
  })

  it('persists chargeId from the new invoice.payments structure', async () => {
    const { whereMock } = makeSelectChain([{ userId: 'user_from_sub' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.invoiceValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')
    await handleInvoicePaid(mockDb as never, {
      id: 'evt_inv',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_abc',
          // API 2025-09-30.clover：订阅在 parent.subscription_details，支付记录在
          // payments.data[].payment，顶层已无 charge / subscription。
          parent: { subscription_details: { subscription: 'sub_ghi' } },
          payments: { data: [{ payment: { charge: 'ch_def' } }] },
          amount_paid: 999,
          currency: 'usd',
          created: 1700000000,
        },
      },
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.invoiceValues?.chargeId).toBe('ch_def')
    expect(captured.invoiceValues?.type).toBe('subscription')
  })

  it('falls back to payment_intent id when no charge is present', async () => {
    const { whereMock } = makeSelectChain([{ userId: 'user_pi' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.invoiceValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')
    await handleInvoicePaid(mockDb as never, {
      id: 'evt_inv_pi',
      data: {
        object: {
          id: 'in_pi',
          customer: 'cus_pi',
          parent: { subscription_details: { subscription: 'sub_pi' } },
          payments: { data: [{ payment: { payment_intent: 'pi_123' } }] },
          amount_paid: 500,
          currency: 'usd',
          created: 1700000002,
        },
      },
    })

    expect(captured.invoiceValues?.chargeId).toBe('pi_123')
  })

  it('looks up userId from subscriptions via customerId', async () => {
    const { whereMock } = makeSelectChain([{ userId: 'user_found' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.invoiceValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')
    await handleInvoicePaid(mockDb as never, {
      id: 'evt_inv_2',
      data: {
        object: {
          id: 'in_456',
          customer: 'cus_lookup',
          parent: { subscription_details: { subscription: 'sub_789' } },
          payments: { data: [{ payment: { charge: null } }] },
          amount_paid: 1999,
          currency: 'usd',
          created: 1700000001,
        },
      },
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.invoiceValues?.userId).toBe('user_found')
  })

  it('never writes Invalid Date when the timestamp is missing', async () => {
    const { whereMock } = makeSelectChain([{ userId: 'user_no_ts' }])
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock }) })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        captured.invoiceValues = v
        return {
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }
      }),
    })

    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')
    await handleInvoicePaid(mockDb as never, {
      id: 'evt_inv_no_ts',
      data: {
        object: {
          id: 'in_no_ts',
          customer: 'cus_no_ts',
          parent: null,
          payments: null,
          amount_paid: 100,
          currency: 'usd',
        },
      },
    })

    // 缺时间戳时整列不写，而不是写入 `new Date(undefined * 1000)`。
    expect(captured.invoiceValues).not.toHaveProperty('paidAt')
  })
})

// customer.subscription.created / updated —— 周期字段在 items.data[] 上（API 2025-09-30）。
describe('handleSubscriptionUpsert — 周期字段读取自订阅项', () => {
  const capturedSet: { value: Record<string, unknown> | null } = { value: null }

  beforeEach(() => {
    capturedSet.value = null
    mockDb.update.mockReturnValue({
      set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedSet.value = v
        // `returning` 判定订阅行是否已存在：空数组表示需要补建。
        return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
      }),
    })
  })

  it('从 items.data[0] 读取周期与 price', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_new',
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: 'price_pro_monthly' },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(capturedSet.value).toMatchObject({
      status: 'active',
      priceId: 'price_pro_monthly',
      cancelAtPeriodEnd: false,
    })
    // 必须是有效 Date，不能是 `new Date(undefined * 1000)` 产生的 Invalid Date。
    const start = capturedSet.value?.currentPeriodStart as Date
    expect(start).toBeInstanceOf(Date)
    expect(Number.isNaN(start.getTime())).toBe(false)
    expect(start.toISOString()).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('items 为空时不写周期列，也不写 Invalid Date', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_empty_items',
      status: 'trialing',
      items: { data: [] },
    })

    expect(capturedSet.value).toMatchObject({ status: 'trialing', priceId: '' })
    expect(capturedSet.value).not.toHaveProperty('currentPeriodStart')
    expect(capturedSet.value).not.toHaveProperty('currentPeriodEnd')
  })

  it('cancel_at_period_end 缺失时按 false 处理', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_no_cancel',
      status: 'active',
      items: {
        data: [{ price: { id: 'price_x' }, current_period_start: 1, current_period_end: 2 }],
      },
    })

    expect(capturedSet.value?.cancelAtPeriodEnd).toBe(false)
  })

  // 这三列此前从不被写入，账单页金额列因此显示 `—`。
  it('把 price 的金额、币种与周期写入订阅行', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_with_price',
      status: 'active',
      items: {
        data: [
          {
            price: {
              id: 'price_1USEaeK7geIdVnsajOAqUpyJ',
              currency: 'usd',
              unit_amount: 599,
              recurring: { interval: 'month' },
            },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(capturedSet.value).toMatchObject({
      amount: 599,
      currency: 'usd',
      interval: 'month',
    })
  })

  it('年付 Price 写入 year 周期', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_yearly',
      status: 'active',
      items: {
        data: [
          {
            price: {
              id: 'price_yearly',
              currency: 'USD',
              unit_amount: 28100,
              recurring: { interval: 'year' },
            },
            current_period_start: 1700000000,
            current_period_end: 1734067200,
          },
        ],
      },
    })

    expect(capturedSet.value).toMatchObject({ interval: 'year', amount: 28100 })
  })

  it('一次性 Price（无 recurring）不写 interval 列', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_one_time',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_lifetime', currency: 'usd', unit_amount: 1400 },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(capturedSet.value).toMatchObject({ amount: 1400, currency: 'usd' })
    // 没有 recurring 就整列不写：写 `null` 会把已正确的值擦掉。
    expect(capturedSet.value).not.toHaveProperty('interval')
  })

  it('price 缺少金额细节时不写这三个列，而不是写 undefined', async () => {
    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_incomplete',
      // 中间态订阅（如 `incomplete`）可能还没有定价细节。
      status: 'incomplete',
      items: {
        data: [
          {
            price: { id: 'price_pending', unit_amount: null },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(capturedSet.value).not.toHaveProperty('amount')
    expect(capturedSet.value).not.toHaveProperty('currency')
    expect(capturedSet.value).not.toHaveProperty('interval')
  })
})

/**
 * 事件顺序无关性。
 *
 * Stripe 不保证 `checkout.session.completed` / `customer.subscription.created` /
 * `invoice.paid` 三个事件的投递顺序。原实现只认「订阅行已存在」，事件抢跑就会
 * 静默丢数据：付款记录写出一行 `user_id` 为 NULL 的孤儿行（用户永远查不到），
 * 订阅的 Price / 周期则永远补不上。
 */
describe('webhook 事件顺序无关', () => {
  it('invoice.paid 找不到归属时不写孤儿行，抛错让 Stripe 重投', async () => {
    // 两次反查都落空：订阅行还没写。
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    })
    // insert 链必须完整：否则代码会在 `.values()` 处因 mock 缺陷而抛错，
    // 测试就成了「因为 mock 坏了才通过」的假阳性。
    const valuesMock = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    })
    const insertSpy = vi.fn()
    mockDb.insert.mockImplementation(() => {
      insertSpy()
      return { values: valuesMock }
    })

    const { handleInvoicePaid } = await import('@/routes/api/webhooks/stripe')

    await expect(
      handleInvoicePaid(mockDb as never, {
        id: 'evt_orphan',
        data: {
          object: {
            id: 'in_orphan',
            customer: 'cus_orphan',
            parent: { subscription_details: { subscription: 'sub_orphan' } },
            payments: { data: [{ payment: { charge: 'ch_orphan' } }] },
            amount_paid: 599,
            currency: 'usd',
            created: 1700000000,
          },
        },
      }),
    ).rejects.toThrow(/no matching subscription row/)

    // 写出一行 user_id 为 NULL 的记录等于静默丢钱：用户在自己的账单页看不到它。
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('customer.subscription.created 在订阅行缺失时用 metadata 补建', async () => {
    // 反查订阅行落空。
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    })
    const insertSpy = vi.fn()
    mockDb.insert.mockImplementation(() => {
      insertSpy()
      return {
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }
    })
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    })

    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_race',
      status: 'active',
      cancel_at_period_end: false,
      // Stripe 会把 Checkout Session 的 metadata 复制到 subscription。
      metadata: { userId: 'user_race' },
      customer: 'cus_race',
      items: {
        data: [
          {
            price: {
              id: 'price_race',
              currency: 'usd',
              recurring: { interval: 'month' },
              unit_amount: 599,
            },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(insertSpy).toHaveBeenCalled()
  })

  it('订阅行已存在时只更新，不重复插入', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockReturnValue({ limit: vi.fn().mockResolvedValue([{ userId: 'user_exists' }]) }),
      }),
    })
    const insertSpy = vi.fn()
    mockDb.insert.mockImplementation(() => {
      insertSpy()
      return {
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }
    })
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'sub_exists' }]) }),
      }),
    })

    const { handleSubscriptionUpsert } = await import('@/routes/api/webhooks/stripe')
    await handleSubscriptionUpsert(mockDb as never, {
      id: 'sub_exists',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { userId: 'user_exists' },
      customer: 'cus_exists',
      items: {
        data: [
          {
            price: {
              id: 'price_x',
              currency: 'usd',
              recurring: { interval: 'month' },
              unit_amount: 599,
            },
            current_period_start: 1700000000,
            current_period_end: 1702598400,
          },
        ],
      },
    })

    expect(insertSpy).not.toHaveBeenCalled()
    expect(mockDb.update).toHaveBeenCalled()
  })
})

/**
 * 回跳地址必须同源。
 *
 * 客户端传的 `successUrl` / `cancelUrl` / `returnUrl` 会被原样交给 Stripe：
 * 不校验等于把「付款后跳到哪里」的决定权交给客户端，是开放重定向——攻击者可以让
 * 受害者付完款后落在仿冒页上继续骗取信息。
 */
describe('回跳地址必须同源', () => {
  beforeEach(() => {
    vi.doUnmock('@/config/website')
    vi.doUnmock('@/auth/auth')
    vi.doUnmock('@/lib/rate-limit')
    vi.resetModules()
  })

  /** 导入支付路由；`customerRows` 命中 `subscriptions.customerId` 查询（门户入口）。 */
  async function importRoute(customerRows: unknown[] = []) {
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
        api: { getSession: async () => ({ user: { id: 'user_1', email: 'a@b.c' } }) },
      }),
    }))
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({
          VITE_BASE_URL: 'https://jerbix.dev',
          VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_month',
        }),
      )
      return { ...actual, websiteConfig: base }
    })
    // 同源校验以 `publicEnv.VITE_BASE_URL` 为准，必须与上面的站点一致。
    vi.doMock('@/env/public', async () => {
      const actual = await vi.importActual<typeof import('@/env/public')>('@/env/public')
      return { ...actual, publicEnv: { ...actual.publicEnv, VITE_BASE_URL: 'https://jerbix.dev' } }
    })
    vi.doMock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true }))
    mockDb.select = vi.fn().mockImplementation((fields: Record<string, unknown>) => {
      const first = fields ? Object.values(fields)[0] : undefined
      const name = (first as { name?: string } | undefined)?.name
      return makeSelectChain(name === 'subscriptions.customerId' ? customerRows : []).selectMock()
    })
    return import('@/routes/api/payment/$')
  }

  const checkoutBody = {
    priceId: 'price_month',
    successUrl: 'https://jerbix.dev/zh/dashboard/billing?checkout=success',
    cancelUrl: 'https://jerbix.dev/zh/pricing?checkout=cancelled',
    mode: 'subscription' as const,
  }

  async function post(body: unknown) {
    const { Route } = await importRoute()
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.POST as (ctx: { request: Request }) => Promise<Response>
    return handler({
      request: new Request('https://jerbix.dev/api/payment', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    })
  }

  it('同源回跳地址照常创建 Checkout Session', async () => {
    const response = await post(checkoutBody)
    expect(response.status).toBe(200)
    expect(mockCheckoutProvider.createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  it('外域 successUrl 返回 400，不创建 Checkout Session', async () => {
    const response = await post({ ...checkoutBody, successUrl: 'https://evil.com/phish' })
    expect(response.status).toBe(400)
    expect(mockCheckoutProvider.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('外域 cancelUrl 返回 400，不创建 Checkout Session', async () => {
    const response = await post({ ...checkoutBody, cancelUrl: 'https://evil.com/phish' })
    expect(response.status).toBe(400)
    expect(mockCheckoutProvider.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('外域门户 returnUrl 返回 400，不创建门户链接', async () => {
    const { Route } = await importRoute([{ customerId: 'cus_1' }])
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.DELETE as (ctx: { request: Request }) => Promise<Response>

    const response = await handler({
      request: new Request('https://jerbix.dev/api/payment', {
        method: 'DELETE',
        body: JSON.stringify({ returnUrl: 'https://evil.com/phish' }),
      }),
    })

    expect(response.status).toBe(400)
    expect(mockCheckoutProvider.createCustomerPortalLink).not.toHaveBeenCalled()
  })

  it('同源门户 returnUrl 照常创建门户链接', async () => {
    const { Route } = await importRoute([{ customerId: 'cus_1' }])
    const handlers = (
      Route as unknown as { options: { server: { handlers: Record<string, unknown> } } }
    ).options.server.handlers
    const handler = handlers.DELETE as (ctx: { request: Request }) => Promise<Response>

    const response = await handler({
      request: new Request('https://jerbix.dev/api/payment', {
        method: 'DELETE',
        body: JSON.stringify({ returnUrl: 'https://jerbix.dev/zh/dashboard/billing' }),
      }),
    })

    expect(response.status).toBe(200)
    expect(mockCheckoutProvider.createCustomerPortalLink).toHaveBeenCalledTimes(1)
  })
})
