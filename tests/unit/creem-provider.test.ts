import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CreemPaymentProvider,
  creemInterval,
  normalizeCreemEvent,
  parseCreemProducts,
  verifyCreemSignature,
} from '@/core/payment/provider/creem'

/**
 * Creem 适配器：业务层只消费归一化后的 `PaymentEvent` / `ProviderSubscription`，
 * 因此这里的断言集中在「Creem 的字段形状 → 我们的中立模型」这一层。
 *
 * 所有 HTTP 调用都用 mock fetch，测试不触网、不需要 Creem 账号。
 */

const products = { pro_monthly: 'prod_month', lifetime: 'prod_life' }
const referenceOf = (productId: string) =>
  Object.entries(products).find(([, id]) => id === productId)?.[0] ?? null

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('商品映射', () => {
  it('解析 reference=productId 列表', () => {
    expect(parseCreemProducts('pro_monthly=prod_a,lifetime=prod_b')).toEqual({
      pro_monthly: 'prod_a',
      lifetime: 'prod_b',
    })
  })

  it('忽略空项与缺等号的项，空值返回空表', () => {
    expect(parseCreemProducts('a=prod_a,,broken,=prod_x,b=')).toEqual({ a: 'prod_a' })
    expect(parseCreemProducts(undefined)).toEqual({})
    expect(parseCreemProducts('')).toEqual({})
  })
})

describe('计费周期', () => {
  it('把 Creem 的 billing_period 映射成 interval 与次数', () => {
    expect(creemInterval('every-month')).toEqual({ interval: 'month', intervalCount: 1 })
    expect(creemInterval('every-year')).toEqual({ interval: 'year', intervalCount: 1 })
    expect(creemInterval('every-three-months')).toEqual({ interval: 'month', intervalCount: 3 })
    expect(creemInterval('every-six-months')).toEqual({ interval: 'month', intervalCount: 6 })
  })

  it('一次性或未知周期返回 null', () => {
    expect(creemInterval(null)).toEqual({ interval: null, intervalCount: null })
    expect(creemInterval('weird')).toEqual({ interval: null, intervalCount: null })
  })
})

describe('Webhook 签名', () => {
  const secret = 'whsec_test'

  it('相同密钥与原文校验通过', async () => {
    const raw = '{"id":"evt_1"}'
    const signature = await sign(raw, secret)
    await expect(verifyCreemSignature(raw, signature, secret)).resolves.toBe(true)
  })

  it('签名或原文不一致时失败', async () => {
    const signature = await sign('{"id":"evt_1"}', secret)
    await expect(verifyCreemSignature('{"id":"evt_2"}', signature, secret)).resolves.toBe(false)
    await expect(verifyCreemSignature('{"id":"evt_1"}', signature, 'other')).resolves.toBe(false)
    await expect(verifyCreemSignature('{"id":"evt_1"}', '', secret)).resolves.toBe(false)
  })

  async function sign(raw: string, key: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const bytes = new Uint8Array(
      await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(raw)),
    )
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
})

describe('事件归一化', () => {
  it('checkout.completed 的一次性付款写入 payment，并带上归属', () => {
    const event = normalizeCreemEvent(
      {
        id: 'evt_1',
        eventType: 'checkout.completed',
        created_at: 1728734327412,
        object: {
          id: 'ch_1',
          metadata: { userId: 'user_1', productId: 'template', offerId: 'once' },
          product: { id: 'prod_life', billing_type: 'one_time' },
          customer: { id: 'cust_1' },
          order: {
            id: 'ord_1',
            transaction: 'tran_1',
            amount: 9900,
            amount_paid: 9900,
            currency: 'USD',
            type: 'one_time',
          },
        },
      },
      referenceOf,
    )

    expect(event).toMatchObject({
      provider: 'creem',
      type: 'checkout.completed',
      created: 1728734327,
    })
    expect(event.payment).toMatchObject({
      id: 'tran_1',
      userId: 'user_1',
      productId: 'template',
      offerId: 'once',
      type: 'one_time',
      amount: 9900,
      currency: 'usd',
      status: 'paid',
    })
    expect(event.subscription).toBeUndefined()
  })

  it('checkout.completed 的订阅同时归一化订阅快照', () => {
    const event = normalizeCreemEvent(
      {
        id: 'evt_2',
        eventType: 'checkout.completed',
        created_at: 1728734327412,
        object: {
          id: 'ch_2',
          metadata: { userId: 'user_2' },
          product: { id: 'prod_month', billing_type: 'recurring' },
          customer: { id: 'cust_2' },
          subscription: {
            id: 'sub_1',
            status: 'active',
            product: {
              id: 'prod_month',
              price: 990,
              currency: 'USD',
              billing_type: 'recurring',
              billing_period: 'every-month',
            },
            customer: { id: 'cust_2' },
            items: [{ price_id: 'pprice_1', product_id: 'prod_month' }],
            current_period_start_date: '2024-10-12T11:58:38.000Z',
            current_period_end_date: '2024-11-12T11:58:38.000Z',
          },
        },
      },
      referenceOf,
    )

    expect(event.subscriptionId).toBe('sub_1')
    expect(event.subscription).toMatchObject({
      id: 'sub_1',
      userId: 'user_2',
      customerId: 'cust_2',
      priceId: 'pprice_1',
      reference: 'pro_monthly',
      amount: 990,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1,
      status: 'active',
      cancelAtPeriodEnd: false,
    })
    expect(event.subscription?.currentPeriodEnd).toBe(
      Math.floor(Date.parse('2024-11-12T11:58:38.000Z') / 1000),
    )
  })

  it('subscription.paid 写入订阅付款，金额取 last_transaction', () => {
    const event = normalizeCreemEvent(
      {
        id: 'evt_3',
        eventType: 'subscription.paid',
        created_at: 1728734327355,
        object: {
          id: 'sub_2',
          status: 'active',
          product: {
            id: 'prod_month',
            price: 990,
            currency: 'USD',
            billing_type: 'recurring',
            billing_period: 'every-month',
          },
          customer: { id: 'cust_3' },
          metadata: { userId: 'user_3' },
          last_transaction: {
            id: 'tran_3',
            amount: 990,
            amount_paid: 1188,
            currency: 'USD',
            status: 'paid',
          },
        },
      },
      referenceOf,
    )

    expect(event.payment).toMatchObject({
      id: 'tran_3',
      subscriptionId: 'sub_2',
      type: 'subscription',
      amount: 1188,
      currency: 'usd',
      status: 'paid',
    })
  })

  it('scheduled_cancel 归一化为 active + 周期末取消', () => {
    const event = normalizeCreemEvent(
      {
        id: 'evt_4',
        eventType: 'subscription.scheduled_cancel',
        created_at: 1728734327355,
        object: {
          id: 'sub_3',
          status: 'scheduled_cancel',
          product: {
            id: 'prod_month',
            price: 990,
            currency: 'USD',
            billing_type: 'recurring',
            billing_period: 'every-month',
          },
          customer: 'cust_4',
        },
      },
      referenceOf,
    )

    expect(event.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
  })
})

describe('provider 方法', () => {
  function provider() {
    return new CreemPaymentProvider('creem_test_key', 'whsec', products, true)
  }

  it('listPrices 按引用查商品并换算成目录条目', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const id = String(input).split('/').at(-1)
      return Response.json({
        id,
        price: id === 'prod_life' ? 9900 : 990,
        currency: 'USD',
        billing_type: id === 'prod_life' ? 'one_time' : 'recurring',
        billing_period: id === 'prod_life' ? null : 'every-month',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const prices = await provider().listPrices(['pro_monthly', 'lifetime', 'unmapped'])

    expect(prices).toEqual([
      {
        id: 'prod_month',
        reference: 'pro_monthly',
        amount: 990,
        currency: 'usd',
        mode: 'subscription',
        interval: 'month',
        intervalCount: 1,
      },
      {
        id: 'prod_life',
        reference: 'lifetime',
        amount: 9900,
        currency: 'usd',
        mode: 'payment',
        interval: null,
        intervalCount: null,
      },
    ])
    // 沙盒地址 + x-api-key 头：密钥不能进 URL。
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://test-api.creem.io/v1/products/prod_month',
    )
  })

  it('createCheckoutSession 传 product_id、request_id 与 metadata', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        product_id: 'prod_life',
        request_id: 'idem_1',
        success_url: 'https://example.com/ok',
        metadata: { userId: 'user_1', productId: 'template', offerId: 'once' },
      })
      expect(init?.headers).toMatchObject({ 'x-api-key': 'creem_test_key' })
      return Response.json({
        id: 'ch_1',
        status: 'pending',
        checkout_url: 'https://creem.io/pay/ch_1',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider().createCheckoutSession({
      priceId: 'prod_life',
      userId: 'user_1',
      customerEmail: 'a@example.com',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
      mode: 'payment',
      productId: 'template',
      offerId: 'once',
      idempotencyKey: 'idem_1',
    })

    expect(result).toMatchObject({ url: 'https://creem.io/pay/ch_1', sessionId: 'ch_1' })
  })

  it('retrieveCheckoutSession 把 Creem 状态映射成 open / complete / expired', async () => {
    const statuses = ['pending', 'processing', 'completed', 'expired']
    const results: string[] = []
    for (const status of statuses) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ id: 'ch_1', status })),
      )
      const result = await provider().retrieveCheckoutSession('ch_1')
      results.push(result.status)
    }
    expect(results).toEqual(['open', 'open', 'complete', 'expired'])
  })

  it('createCustomerPortalLink 返回 customer_portal_link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ customer_portal_link: 'https://creem.io/portal/1' })),
    )
    await expect(
      provider().createCustomerPortalLink({
        customerId: 'cust_1',
        returnUrl: 'https://example.com',
      }),
    ).resolves.toEqual({ url: 'https://creem.io/portal/1' })
  })

  it('retrieveSubscription 归一化订阅字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 'sub_9',
          status: 'active',
          product: {
            id: 'prod_month',
            price: 990,
            currency: 'USD',
            billing_type: 'recurring',
            billing_period: 'every-year',
          },
          customer: { id: 'cust_9' },
          metadata: { userId: 'user_9' },
          items: [{ price_id: 'pprice_9', product_id: 'prod_month' }],
          current_period_start_date: '2024-10-12T11:58:38.000Z',
          current_period_end_date: '2025-10-12T11:58:38.000Z',
        }),
      ),
    )

    await expect(provider().retrieveSubscription('sub_9')).resolves.toMatchObject({
      id: 'sub_9',
      userId: 'user_9',
      reference: 'pro_monthly',
      interval: 'year',
      intervalCount: 1,
      status: 'active',
    })
  })
})
