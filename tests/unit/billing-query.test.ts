import { describe, expect, it } from 'vitest'
import { getProducts } from '@/config/products'
import {
  type PaymentRecord,
  paymentStatusMessageKey,
  productNameForProductId,
  type SubscriptionRecord,
  splitBillingDisplay,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'

/**
 * 账单页展示逻辑：产品名必须由产品 id 查出（不能让用户看 `price_xxx`），
 * 周期徽标不能把未知周期硬说成「按月」。
 */
describe('billing-query 展示映射', () => {
  describe('productNameForProductId', () => {
    it('按产品 id 查出定价页上的产品名', () => {
      expect(productNameForProductId('pro')).toBe(
        getProducts().find((product) => product.id === 'pro')?.name,
      )
      expect(productNameForProductId('lifetime')).toBe(
        getProducts().find((product) => product.id === 'lifetime')?.name,
      )
    })

    it('产品不存在时返回 undefined，调用方退回显示 Price id', () => {
      expect(productNameForProductId('enterprise')).toBeUndefined()
    })

    it('产品 id 为空时返回 undefined', () => {
      expect(productNameForProductId(null)).toBeUndefined()
      expect(productNameForProductId('')).toBeUndefined()
    })
  })

  describe('subscriptionIntervalMessageKey', () => {
    it('month / year 各自映射', () => {
      expect(subscriptionIntervalMessageKey('month')).toBe('settings_billing_interval_month')
      expect(subscriptionIntervalMessageKey('year')).toBe('settings_billing_interval_year')
    })

    it('只有 one_time 才是终身', () => {
      // 「终身」是一次性买断语义。此前空值也落到这里：订阅行先建、周期后补，
      // 中间那段时间月付用户会看到「专业版 · 终身」。
      expect(subscriptionIntervalMessageKey('one_time')).toBe('settings_billing_interval_lifetime')
    })

    it('空值表示「还不知道」，不冒充终身，也不编一个用户看不懂的状态词', () => {
      // 返回 null 而非「周期待同步」之类后端术语；调用方据此只渲染金额。
      expect(subscriptionIntervalMessageKey(null)).toBeNull()
      expect(subscriptionIntervalMessageKey(undefined)).toBeNull()
      expect(subscriptionIntervalMessageKey('')).toBeNull()
    })

    it('未知周期返回 null，页面只显示金额', () => {
      // 按周 / 按天时不该说成终身，也不该杜撰周期文案。
      expect(subscriptionIntervalMessageKey('week')).toBeNull()
    })
  })

  describe('subscriptionStatusMessageKey', () => {
    it('已启用模板的实际状态都有对应文案', () => {
      expect(subscriptionStatusMessageKey('active')).toBe('settings_billing_active')
      expect(subscriptionStatusMessageKey('canceled')).toBe('settings_billing_cancelled')
      expect(subscriptionStatusMessageKey('past_due')).toBe('settings_billing_past_due')
      expect(subscriptionStatusMessageKey('trialing')).toBe('settings_billing_trialing')
    })

    it('未知状态落到原始值展示', () => {
      expect(subscriptionStatusMessageKey('paused')).toBe('settings_billing_status')
    })
  })

  describe('paymentStatusMessageKey', () => {
    it('付款成功显示已支付，退款显示已退款', () => {
      // `payments.status` 与订阅状态不是一套；复用 active 文案会让每笔付款都显示「生效中」。
      expect(paymentStatusMessageKey('paid')).toBe('settings_billing_paid')
      expect(paymentStatusMessageKey('refunded')).toBe('settings_billing_refunded')
    })

    it('未知状态落到原始值，不冒充已支付', () => {
      expect(paymentStatusMessageKey('pending')).toBe('settings_billing_payment_status')
    })
  })
})

/**
 * 「我的方案」只展示当前生效的那一份，其余进历史。
 *
 * 判定完全依据服务端下发的 `isCurrent`（那是「等级说了算」的归属判定结果），
 * 客户端不重复判定一遍——两处各判一次迟早漂移。
 */
describe('splitBillingDisplay', () => {
  function sub(overrides: Partial<SubscriptionRecord> & { id: string }): SubscriptionRecord {
    return {
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  function purchase(overrides: Partial<PaymentRecord> & { id: string }): PaymentRecord {
    return {
      type: 'one_time',
      status: 'paid',
      amount: 9900,
      currency: 'usd',
      createdAt: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('当前生效的订阅进「我的方案」，其余进历史', () => {
    const display = splitBillingDisplay({
      subscriptions: [
        sub({ id: 'sub_current', isCurrent: true }),
        sub({ id: 'sub_old', status: 'canceled', createdAt: '2025-06-01T00:00:00Z' }),
      ],
      payments: [],
    })

    expect(display.currentSubscription?.id).toBe('sub_current')
    expect(display.currentPurchase).toBeNull()
    expect(display.historySubscriptions.map((s) => s.id)).toEqual(['sub_old'])
  })

  it('当前生效的是买断时，订阅全部进历史', () => {
    // 买断接管订阅：当前方案是买断那条订阅付款记录，原订阅只是历史。
    const display = splitBillingDisplay({
      subscriptions: [sub({ id: 'sub_1', status: 'active' })],
      payments: [purchase({ id: 'pay_1', isCurrent: true })],
    })

    expect(display.currentPurchase?.id).toBe('pay_1')
    expect(display.currentSubscription).toBeNull()
    expect(display.historySubscriptions.map((s) => s.id)).toEqual(['sub_1'])
    // 当前生效的那笔买断不在历史里。
    expect(display.historyPurchases).toHaveLength(0)
  })

  it('没有当前生效项时退回最近的一条订阅，不留空白', () => {
    // 订阅已取消：页面仍要告诉用户「你有过什么」，只是它不再是当前方案。
    const display = splitBillingDisplay({
      subscriptions: [
        sub({ id: 'sub_old', status: 'canceled', createdAt: '2025-01-01T00:00:00Z' }),
        sub({ id: 'sub_new', status: 'canceled', createdAt: '2026-01-01T00:00:00Z' }),
      ],
      payments: [],
    })

    expect(display.currentSubscription?.id).toBe('sub_new')
    expect(display.historySubscriptions.map((s) => s.id)).toEqual(['sub_old'])
  })

  it('订阅付款不算「历史买断」，历史里只放一次性购买', () => {
    const display = splitBillingDisplay({
      subscriptions: [],
      payments: [purchase({ id: 'pay_sub', type: 'subscription' }), purchase({ id: 'pay_once' })],
    })

    expect(display.historyPurchases.map((p) => p.id)).toEqual(['pay_once'])
  })

  it('既没有订阅也没有买断时，页面没有任何方案', () => {
    const display = splitBillingDisplay({ subscriptions: [], payments: [] })

    expect(display.currentSubscription).toBeNull()
    expect(display.currentPurchase).toBeNull()
    expect(display.historySubscriptions).toHaveLength(0)
    expect(display.historyPurchases).toHaveLength(0)
  })
})
