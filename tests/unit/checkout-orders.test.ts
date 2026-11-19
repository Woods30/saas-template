import { describe, expect, it } from 'vitest'
import type { PaymentProvider } from '@/core/payment/types'
import { beginCheckout } from '@/modules/subscriptions/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 在线结账写订单。
 *
 * 订单是「购买意图」的稳定记录：一次性购买每次结账都要落一条，订阅结账在
 * 预留创建时落一条并写进 `checkout_reservations.order_id`，重试复用同一订单。
 * 金额与币种留空——渠道价格目录才是金额事实源。
 */

function fakeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    getProviderName: () => 'stripe',
    listPrices: async () => [],
    createCheckoutSession: async () => ({
      url: 'https://pay.test/session',
      sessionId: 'cs_1',
      expiresAt: 1_800_000_000,
    }),
    retrieveCheckoutSession: async () => ({ status: 'open', subscriptionId: null }),
    createCustomerPortalLink: async () => ({ url: 'https://pay.test/portal' }),
    retrieveSubscription: async () => {
      throw new Error('unused')
    },
    cancelSubscription: async () => {
      throw new Error('unused')
    },
    refundPayment: async () => {
      throw new Error('unused')
    },
    parseWebhookEvent: async () => {
      throw new Error('unused')
    },
    ...overrides,
  }
}

function checkoutInput(mode: 'subscription' | 'payment') {
  return {
    userId: 'u1',
    customerEmail: 'u1@example.com',
    priceId: 'p1',
    productId: 'pro',
    offerId: 'monthly',
    mode,
    successUrl: 'https://example.com/ok',
    cancelUrl: 'https://example.com/no',
  }
}

interface OrderRow {
  id: string
  order_no: string
  status: string
  mode: string
  provider_session_id: string | null
  amount: number | null
  currency: string | null
}

function readOrders(sqlite: ReturnType<typeof createTestDatabase>['sqlite']): OrderRow[] {
  return sqlite
    .prepare('SELECT id, order_no, status, mode, provider_session_id, amount, currency FROM orders')
    .all() as unknown as OrderRow[]
}

describe('在线结账写订单', () => {
  it('一次性结账写一条订单并在成功后标记 open', async () => {
    const { db, sqlite } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const provider = fakeProvider({
      createCheckoutSession: async () => ({
        url: 'https://pay.test/pay',
        sessionId: 'cs_pay',
        expiresAt: 1_800_000_000,
      }),
    })

    const result = await beginCheckout(db, provider, checkoutInput('payment'))

    expect(result?.sessionId).toBe('cs_pay')
    const orders = readOrders(sqlite)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      status: 'open',
      mode: 'payment',
      provider_session_id: 'cs_pay',
      amount: null,
      currency: null,
    })
    expect(orders[0]?.order_no).toMatch(/^ord_\d{14}_[0-9A-Z]{8}$/)
    sqlite.close()
  })

  it('订阅结账写订单，重试复用同一订单', async () => {
    const { db, sqlite } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const provider = fakeProvider({
      createCheckoutSession: async () => ({
        url: 'https://pay.test/sub',
        sessionId: 'cs_sub',
        expiresAt: 1_800_000_000,
      }),
    })

    await beginCheckout(db, provider, checkoutInput('subscription'))
    await beginCheckout(db, provider, checkoutInput('subscription'))

    const orders = readOrders(sqlite)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      status: 'open',
      mode: 'subscription',
      provider_session_id: 'cs_sub',
    })
    const reservation = sqlite.prepare('SELECT order_id FROM checkout_reservations').get() as {
      order_id: string | null
    }
    expect(reservation.order_id).toBe(orders[0]?.id)
    sqlite.close()
  })

  it('渠道创建失败时订单标记 failed', async () => {
    const { db, sqlite } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const provider = fakeProvider({
      createCheckoutSession: async () => {
        throw new Error('provider down')
      },
    })

    await expect(beginCheckout(db, provider, checkoutInput('payment'))).rejects.toThrow(
      'provider down',
    )

    const orders = readOrders(sqlite)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      status: 'failed',
      mode: 'payment',
      provider_session_id: null,
    })
    sqlite.close()
  })
})
