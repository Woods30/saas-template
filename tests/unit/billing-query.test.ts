import { describe, expect, it } from 'vitest'
import { getPricingPlans } from '@/config/blocks/pricing'
import { findPlanIdByPriceId, type PriceMap } from '@/config/payment'
import {
  planNameForSubscription,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from '@/payment/billing-query'

const priceMap: PriceMap = {
  pro_monthly: { month: 'price_month', year: 'price_year' },
  lifetime: { one_time: 'price_lifetime' },
}

/**
 * 账单页的展示逻辑。
 *
 * 守两件事：套餐名必须由 Price id 反查（而不是让用户看 price_xxx），周期徽标不能
 * 把未知周期硬说成「按月」。二者都是纯函数，不渲染也能覆盖。
 */
describe('billing-query 展示映射', () => {
  describe('planNameForSubscription', () => {
    it('按 Price id 反查出定价页上的套餐名', () => {
      expect(planNameForSubscription('price_month', priceMap)).toBe(
        getPricingPlans().find((plan) => plan.id === 'pro_monthly')?.name,
      )
      expect(planNameForSubscription('price_year', priceMap)).toBe(
        getPricingPlans().find((plan) => plan.id === 'pro_monthly')?.name,
      )
      expect(planNameForSubscription('price_lifetime', priceMap)).toBe(
        getPricingPlans().find((plan) => plan.id === 'lifetime')?.name,
      )
    })

    it('月付与年付映射到同一个套餐', () => {
      // pro_monthly 挂两个 Price：账单页不能显示成两个不同套餐。
      expect(planNameForSubscription('price_month', priceMap)).toBe(
        planNameForSubscription('price_year', priceMap),
      )
    })

    it('Price 不在映射里时返回 undefined，调用方退回显示 Price id', () => {
      expect(planNameForSubscription('price_手工创建的', priceMap)).toBeUndefined()
    })

    it('priceId 为空时返回 undefined', () => {
      expect(planNameForSubscription(null, priceMap)).toBeUndefined()
      expect(planNameForSubscription('', priceMap)).toBeUndefined()
    })
  })

  describe('subscriptionIntervalMessageKey', () => {
    it('month / year 各自映射', () => {
      expect(subscriptionIntervalMessageKey('month')).toBe('settings_billing_interval_month')
      expect(subscriptionIntervalMessageKey('year')).toBe('settings_billing_interval_year')
    })

    it('one_time 与空值都归为终身', () => {
      expect(subscriptionIntervalMessageKey('one_time')).toBe('settings_billing_interval_lifetime')
      expect(subscriptionIntervalMessageKey(null)).toBe('settings_billing_interval_lifetime')
      expect(subscriptionIntervalMessageKey(undefined)).toBe('settings_billing_interval_lifetime')
      expect(subscriptionIntervalMessageKey('')).toBe('settings_billing_interval_lifetime')
    })

    it('未知周期不猜成按月，落到终身而不是崩在 switch 上', () => {
      // Stripe 后台改成按周 / 按天时，页面至少有稳定的输出。
      expect(subscriptionIntervalMessageKey('week')).toBe('settings_billing_interval_lifetime')
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
})

describe('findPlanIdByPriceId 跨周期查重', () => {
  it('月付年付同属一个 plan', () => {
    expect(findPlanIdByPriceId(priceMap, 'price_year')).toBe('pro_monthly')
  })

  it('空映射返回 undefined', () => {
    expect(findPlanIdByPriceId({}, 'price_month')).toBeUndefined()
  })
})
