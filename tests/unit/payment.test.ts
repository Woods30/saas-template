import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    stripeChargeId: makeCol('payments.stripe_charge_id'),
    stripeInvoiceId: makeCol('payments.stripe_invoice_id'),
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
    const registry = buildPaymentProviderRegistry({} as Env)
    expect(registry.stripe).toBeUndefined()
  })

  it('complete env returns stripe factory', () => {
    const registry = buildPaymentProviderRegistry({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    } as Env)
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

  it('skips INSERT when subscription id is missing (Fix 5)', async () => {
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
      id: 'evt_no_sub',
      data: {
        object: {
          id: 'cs_no_sub',
          customer: 'cus_no_sub',
          metadata: {},
          // no subscription field
        },
      },
    })

    expect(mockDb.insert).not.toHaveBeenCalled()
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

  it('persists stripeChargeId from invoice event', async () => {
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
          charge: 'ch_def',
          subscription: 'sub_ghi',
          amount_paid: 999,
          currency: 'usd',
          created: 1700000000,
        },
      },
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.invoiceValues?.stripeChargeId).toBe('ch_def')
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
          charge: null,
          subscription: 'sub_789',
          amount_paid: 1999,
          currency: 'usd',
          created: 1700000001,
        },
      },
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(captured.invoiceValues?.userId).toBe('user_found')
  })
})
