import { describe, expect, it } from 'vitest'
import { normalizeStripeEvent } from '@/payment/provider/stripe'

describe('Stripe 事件归一化', () => {
  it('延迟付款尚未成功时不产生已付款记录', () => {
    const result = normalizeStripeEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: 100,
      data: {
        object: {
          id: 'cs_1',
          mode: 'payment',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'usd',
        },
      },
    })
    expect(result.payment).toBeUndefined()
  })
  it('异步付款成功携带支付归属与交易标识', () => {
    const result = normalizeStripeEvent({
      id: 'evt_2',
      type: 'checkout.session.async_payment_succeeded',
      created: 100,
      data: {
        object: {
          id: 'cs_1',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_1',
          amount_total: 1000,
          currency: 'usd',
          customer: 'cus_1',
          metadata: { userId: 'u1', productId: 'pack', offerId: 'once' },
        },
      },
    })
    expect(result.payment).toMatchObject({
      id: 'pi_1',
      userId: 'u1',
      amount: 1000,
      status: 'paid',
      productId: 'pack',
      offerId: 'once',
    })
  })
  it('退款保留累计退款金额，不直接判为全额退款', () => {
    const result = normalizeStripeEvent({
      id: 'evt_3',
      type: 'charge.refunded',
      created: 100,
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 1000, amount_refunded: 300 } },
    })
    expect(result.refund).toEqual({ chargeId: 'pi_1', amount: 300 })
  })
})
