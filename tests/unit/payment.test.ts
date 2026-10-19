import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '@/env/server'
import { buildPaymentProviderRegistry } from '@/payment'

// ------------------------------------------------------------------------------------------------
// Stripe mock — hoisted so it is ready before vi.mock('@/payment') runs
// ------------------------------------------------------------------------------------------------

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

// ------------------------------------------------------------------------------------------------
// @/payment mock — preserves real exports, overrides getPaymentProvider
// ------------------------------------------------------------------------------------------------

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

// ------------------------------------------------------------------------------------------------
// @/db mock factories — used by webhook handler tests
// ------------------------------------------------------------------------------------------------

// Mutable object to capture insert call arguments for assertion
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

// Drizzle schema objects have nested properties used for query building
const makeCol = (name: string) =>
  ({
    get name() {
      return name
    },
  }) as unknown as { name: string }

// Schema — real drizzle schema objects are class instances with property chains.
// We use plain objects that mimic the property access pattern.
const mockSchema = {
  users: { id: makeCol('users.id') },
  subscriptions: {
    id: makeCol('subscriptions.id'),
    userId: makeCol('subscriptions.userId'),
    customerId: makeCol('subscriptions.customerId'),
    subscriptionId: makeCol('subscriptions.subscriptionId'),
  },
  payments: {
    id: makeCol('payments.id'),
    chargeId: makeCol('payments.charge_id'),
    invoiceId: makeCol('payments.invoice_id'),
    userId: makeCol('payments.user_id'),
  },
  webhookEvents: { id: makeCol('webhook_events.id') },
}

// Pre-built chainable mock — select().from().where().limit() returns a promise
const makeSelectChain = (resolvedRows: unknown[]) => {
  const whereMock = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(resolvedRows),
  })
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })
  return { selectMock, whereMock, fromMock }
}

// A stable mockDb instance — tests configure specific chains and pass it to the handler
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

// ------------------------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------------------------

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
    // Restore for other tests
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

// ------------------------------------------------------------------------------------------------
// POST /api/payment 配置门禁（payment 默认关闭）
// ------------------------------------------------------------------------------------------------
describe('POST /api/payment 门禁', () => {
  function getHandler(method: 'POST' | 'DELETE') {
    return async (route: unknown, request: Request): Promise<Response> => {
      const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
        .options?.server?.handlers
      const handler = handlers?.[method]
      if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
      return (handler as (ctx: { request: Request }) => Promise<Response>)({ request })
    }
  }

  it('payment 关闭时 POST 返回 404，且不调用 auth / rate-limit / provider', async () => {
    const { Route } = await import('@/routes/api/payment/$')
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
    const { Route } = await import('@/routes/api/payment/$')
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

// ------------------------------------------------------------------------------------------------
// Security fix tests
// ------------------------------------------------------------------------------------------------

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
          // 一次性支付没有 subscription 字段
        },
      },
    })

    // 旧实现在没有 subscription 时直接 return，导致 payments.userId 恒为 null、
    // 无法判断谁买了终身版。
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
          // API 2025-09-30.clover：订阅挂在 parent.subscription_details，
          // 支付记录在 payments.data[].payment，顶层已无 charge / subscription。
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
          // created 缺失
        },
      },
    })

    // 缺时间戳时整列不写，而不是写入 `new Date(undefined * 1000)`。
    expect(captured.invoiceValues).not.toHaveProperty('paidAt')
  })
})

// ------------------------------------------------------------------------------------------------
// customer.subscription.created / updated — 周期字段在 items.data[] 上（API 2025-09-30）
// ------------------------------------------------------------------------------------------------

describe('handleSubscriptionUpsert — 周期字段读取自订阅项', () => {
  const capturedSet: { value: Record<string, unknown> | null } = { value: null }

  beforeEach(() => {
    capturedSet.value = null
    mockDb.update.mockReturnValue({
      set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedSet.value = v
        return { where: vi.fn().mockResolvedValue([]) }
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
    // 周期必须是有效 Date，不是 `new Date(undefined * 1000)` 产生的 Invalid Date。
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
})
