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

describe('Stripe 发票事件（支付成功的权威事件）', () => {
  it('一次性支付的 invoice.paid 自带归属，无需 checkout.session.completed', () => {
    // Stripe 不保证事件顺序，端点也可能只投递 invoice.*；付款记录不能单点依赖
    // checkout.session.completed。
    const result = normalizeStripeEvent({
      id: 'evt_inv_1',
      type: 'invoice.paid',
      created: 200,
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          currency: 'usd',
          amount_paid: 100,
          parent: null,
          metadata: { userId: 'u1', productId: 'template', offerId: 'once' },
        },
      },
    })
    expect(result.payment).toMatchObject({
      id: 'in_1',
      invoiceId: 'in_1',
      userId: 'u1',
      productId: 'template',
      offerId: 'once',
      type: 'one_time',
      amount: 100,
      currency: 'usd',
      status: 'paid',
      subscriptionId: null,
    })
  })

  it('订阅续费的 invoice.paid 仍从订阅详情取归属', () => {
    const result = normalizeStripeEvent({
      id: 'evt_inv_2',
      type: 'invoice.paid',
      created: 200,
      data: {
        object: {
          id: 'in_2',
          customer: 'cus_2',
          currency: 'usd',
          amount_paid: 990,
          parent: {
            subscription_details: {
              subscription: 'sub_1',
              metadata: { userId: 'u2' },
            },
          },
        },
      },
    })
    expect(result.subscriptionId).toBe('sub_1')
    expect(result.payment).toMatchObject({
      userId: 'u2',
      type: 'subscription',
      subscriptionId: 'sub_1',
      status: 'paid',
      amount: 990,
    })
  })

  it('invoice.payment_failed 记为失败付款，不授予权益', () => {
    const result = normalizeStripeEvent({
      id: 'evt_inv_3',
      type: 'invoice.payment_failed',
      created: 200,
      data: {
        object: {
          id: 'in_3',
          customer: 'cus_3',
          currency: 'usd',
          amount_due: 990,
          parent: { subscription_details: { subscription: 'sub_1', metadata: { userId: 'u3' } } },
        },
      },
    })
    expect(result.payment).toMatchObject({ status: 'failed', amount: 990 })
  })
})
