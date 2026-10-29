import { describe, expect, it } from 'vitest'
import {
  paymentStatusMessageKey,
  splitBillingDisplay,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'

describe('账单展示', () => {
  it('取消的历史订阅不伪装成当前方案', () => {
    const result = splitBillingDisplay({
      subscriptions: [{ id: 'old', status: 'canceled', createdAt: new Date() }],
      payments: [],
    })
    expect(result.currentSubscription).toBeNull()
    expect(result.historySubscriptions.map((s) => s.id)).toEqual(['old'])
  })
  it('独立一次性购买不取代当前订阅', () => {
    const result = splitBillingDisplay({
      subscriptions: [{ id: 'sub', status: 'active', createdAt: new Date() }],
      payments: [
        {
          id: 'paid',
          type: 'one_time',
          status: 'paid',
          amount: 100,
          currency: 'usd',
          createdAt: new Date(),
        },
      ],
    })
    expect(result.currentSubscription?.id).toBe('sub')
  })
  it('部分退款与全额退款分别展示', () => {
    expect(paymentStatusMessageKey('partially_refunded')).toBe(
      'settings_billing_partially_refunded',
    )
    expect(paymentStatusMessageKey('refunded')).toBe('settings_billing_refunded')
    expect(subscriptionStatusMessageKey('paused')).toBe('settings_billing_status')
    expect(subscriptionIntervalMessageKey(null)).toBeNull()
  })
})
