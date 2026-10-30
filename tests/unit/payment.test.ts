import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StripePaymentProvider } from '@/payment/provider/stripe'

const api = vi.hoisted(() => ({
  checkout: vi.fn(),
  retrieveCheckout: vi.fn(),
  portal: vi.fn(),
  verify: vi.fn(),
  invoicePayments: vi.fn(),
  subscription: vi.fn(),
}))
vi.mock('stripe', () => ({
  default: class {
    static createFetchHttpClient = () => ({})
    static createSubtleCryptoProvider = () => ({})
    checkout = { sessions: { create: api.checkout, retrieve: api.retrieveCheckout } }
    billingPortal = { sessions: { create: api.portal } }
    webhooks = { constructEventAsync: api.verify }
    invoicePayments = { list: api.invoicePayments }
    subscriptions = { retrieve: api.subscription }
  },
}))
beforeEach(() => vi.clearAllMocks())

describe('Stripe 托管支付', () => {
  it('订阅 Checkout 写入归属、复用 customer 并使用服务端幂等键', async () => {
    api.checkout.mockResolvedValue({
      id: 'cs1',
      url: 'https://checkout.stripe.com/session',
      expires_at: 1000,
    })
    const provider = new StripePaymentProvider('test', 'hook')
    const result = await provider.createCheckoutSession({
      userId: 'u1',
      customerEmail: 'u@example.com',
      customerId: 'cus1',
      productId: 'pro',
      offerId: 'yearly',
      idempotencyKey: 'reservation1',
      expiresAt: 1000,
      priceId: 'p1',
      mode: 'subscription',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/no',
    })
    expect(result).toEqual({
      sessionId: 'cs1',
      url: 'https://checkout.stripe.com/session',
      expiresAt: 1000,
    })
    expect(api.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus1',
        expires_at: 1000,
        subscription_data: { metadata: { userId: 'u1', productId: 'pro', offerId: 'yearly' } },
      }),
      { idempotencyKey: 'reservation1' },
    )
    expect(api.checkout.mock.calls[0]?.[0]).not.toHaveProperty('payment_method_types')
  })
  it.each([undefined, 'cus_existing'])(
    '一次性购买按客户是否存在决定创建客户：%s',
    async (customerId) => {
      api.checkout.mockResolvedValue({
        id: 'cs_pack',
        url: 'https://checkout.stripe.com/pack',
        expires_at: 1000,
      })
      await new StripePaymentProvider('test', 'hook').createCheckoutSession({
        userId: 'u1',
        customerEmail: 'u@example.com',
        customerId,
        productId: 'lifetime',
        offerId: 'once',
        idempotencyKey: 'pack_key',
        priceId: 'price_pack',
        mode: 'payment',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/no',
      })
      const payload = api.checkout.mock.calls[0]?.[0]
      expect(payload).toMatchObject({
        mode: 'payment',
        invoice_creation: { enabled: true },
        payment_intent_data: { metadata: { userId: 'u1', productId: 'lifetime', offerId: 'once' } },
      })
      if (customerId) {
        expect(payload).toMatchObject({ customer: 'cus_existing' })
        expect(payload).not.toHaveProperty('customer_creation')
        expect(payload).not.toHaveProperty('customer_email')
      } else {
        expect(payload).toMatchObject({
          customer_email: 'u@example.com',
          customer_creation: 'always',
        })
        expect(payload).not.toHaveProperty('customer')
      }
    },
  )
  it.each(['open', 'complete', 'expired'])('读取 Checkout 的 %s 状态与订阅标识', async (status) => {
    api.retrieveCheckout.mockResolvedValue({ status, subscription: 'sub1' })
    const result = await new StripePaymentProvider('test', 'hook').retrieveCheckoutSession('cs1')
    expect(result).toEqual({ status, subscriptionId: 'sub1' })
  })
  it('拒绝没有跳转地址的 Checkout', async () => {
    api.checkout.mockResolvedValue({ id: 'cs1', url: null })
    const provider = new StripePaymentProvider('test', 'hook')
    await expect(
      provider.createCheckoutSession({
        userId: 'u1',
        customerEmail: 'u@example.com',
        productId: 'pro',
        offerId: 'monthly',
        idempotencyKey: 'key',
        priceId: 'p1',
        mode: 'subscription',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/no',
      }),
    ).rejects.toThrow('Checkout URL missing')
  })
  it('发票多笔付款分别保存实际金额和退款关联', async () => {
    api.verify.mockResolvedValue({
      id: 'evt_multi',
      type: 'invoice.paid',
      created: 100,
      data: {
        object: {
          id: 'inv1',
          amount_paid: 1000,
          currency: 'usd',
          customer: 'cus1',
          parent: { subscription_details: { subscription: 'sub1', metadata: { userId: 'u1' } } },
        },
      },
    })
    api.subscription.mockResolvedValue({
      id: 'sub1',
      metadata: { userId: 'u1' },
      items: { data: [] },
      status: 'active',
    })
    api.invoicePayments.mockReturnValue({
      data: [],
      async *[Symbol.asyncIterator]() {
        yield { id: 'ip1', status: 'paid', amount_paid: 600, payment: { payment_intent: 'pi_a' } }
        yield { id: 'ip2', status: 'paid', amount_paid: 400, payment: { payment_intent: 'pi_b' } }
      },
    })
    const event = await new StripePaymentProvider('test', 'hook').parseWebhookEvent('raw', 'sig')
    // 外部 ID 用 PaymentIntent：与 `checkout.session.completed` 路径对齐，
    // 同一笔钱被两条事件看到时写入同一条记录。
    expect(event.payments).toMatchObject([
      { id: 'pi_a', chargeId: 'pi_a', amount: 600 },
      { id: 'pi_b', chargeId: 'pi_b', amount: 400 },
    ])
    expect(event.payment).toBeUndefined()
  })
  it('验签失败不解析事件', async () => {
    api.verify.mockRejectedValue(new Error('invalid signature'))
    await expect(
      new StripePaymentProvider('test', 'hook').parseWebhookEvent('raw', 'bad'),
    ).rejects.toThrow('invalid signature')
  })
})
