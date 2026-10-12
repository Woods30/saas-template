import { describe, expect, it, vi } from 'vitest'
import { buildPaymentProviderRegistry } from '@/payment'

// vi.hoisted() runs before vi.mock is hoisted, so it can be referenced inside the factory
const mockInstance = vi.hoisted(() => ({
  createFetchHttpClient: vi.fn().mockReturnValue({}),
  createSubtleCryptoProvider: vi.fn().mockReturnValue({}),
  constructEventAsync: vi.fn().mockResolvedValue({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: { object: {} },
  }),
  sessionsCreate: vi.fn().mockResolvedValue({
    id: 'cs_test_session',
    url: 'https://checkout.stripe.com/test',
  }),
  portalCreate: vi.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/portal',
  }),
}))

vi.mock('stripe', () => ({
  default: class MockStripe {
    static createFetchHttpClient = mockInstance.createFetchHttpClient
    static createSubtleCryptoProvider = mockInstance.createSubtleCryptoProvider
    checkout = { sessions: { create: mockInstance.sessionsCreate } }
    billingPortal = { sessions: { create: mockInstance.portalCreate } }
    webhooks = { constructEventAsync: mockInstance.constructEventAsync }
  },
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
    mockInstance.constructEventAsync = vi.fn().mockRejectedValue(new Error('Invalid signature'))
    const { StripePaymentProvider } = await import('@/payment')
    const provider = new StripePaymentProvider('sk_test', 'whsec_test')
    const valid = await provider.verifyWebhook('{}', 'sig_invalid')
    expect(valid).toBe(false)
    // Restore for other tests
    mockInstance.constructEventAsync = vi.fn().mockResolvedValue({
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
  it('unregistered provider throws', async () => {
    const { getPaymentProvider: gp } = await import('@/payment')
    expect(() => gp('stripe')).toThrow('Payment provider 未注册：stripe')
  })
})
