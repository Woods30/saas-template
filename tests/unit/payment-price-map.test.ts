import { describe, expect, it } from 'vitest'
import {
  availableIntervals,
  buildLookupKeyMap,
  collectLookupKeys,
  findOrphanPlanIds,
  findPlanIdByLookupKey,
  isPlanPurchasable,
  resolveLookupKey,
} from '@/config/payment'
import { buildPlanIdByPriceId, mergePricingPlans, type PriceCatalog } from '@/payment/price-catalog'

/**
 * 定价方案 ↔ Stripe Price `lookup_key` 映射：空串不算有效配置（Vite 会把空变量
 * 注入为 `''`）、周期必须与 key 配对、无 key 的 plan 不可购买、plan id 必须存在。
 */

const lookupKeyMap = buildLookupKeyMap({
  VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly',
  VITE_STRIPE_LOOKUP_PRO_YEARLY: 'pro_yearly',
  VITE_STRIPE_LOOKUP_LIFETIME: 'lifetime',
})

describe('buildLookupKeyMap', () => {
  it('全空时返回空映射', () => {
    expect(buildLookupKeyMap({})).toEqual({})
  })

  it('空字符串视为未配置', () => {
    expect(
      buildLookupKeyMap({
        VITE_STRIPE_LOOKUP_PRO_MONTHLY: '',
        VITE_STRIPE_LOOKUP_PRO_YEARLY: '   ',
        VITE_STRIPE_LOOKUP_LIFETIME: '',
      }),
    ).toEqual({})
  })

  it('按月付与年付分别落到 pro_monthly 的不同周期', () => {
    expect(
      buildLookupKeyMap({
        VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly',
        VITE_STRIPE_LOOKUP_PRO_YEARLY: 'pro_yearly',
      }),
    ).toEqual({ pro_monthly: { month: 'pro_monthly', year: 'pro_yearly' } })
  })

  it('lifetime 落到 one_time', () => {
    expect(buildLookupKeyMap({ VITE_STRIPE_LOOKUP_LIFETIME: 'lifetime' })).toEqual({
      lifetime: { one_time: 'lifetime' },
    })
  })

  it('只配一个周期时不补另一个周期', () => {
    const map = buildLookupKeyMap({ VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly' })
    expect(map.pro_monthly).toEqual({ month: 'pro_monthly' })
    expect(map.pro_monthly?.year).toBeUndefined()
  })
})

describe('collectLookupKeys', () => {
  it('汇总所有 key 并去重保序', () => {
    expect(collectLookupKeys(lookupKeyMap)).toEqual(['pro_monthly', 'pro_yearly', 'lifetime'])
  })

  it('空串不入列', () => {
    expect(collectLookupKeys({ pro_monthly: { month: '' } })).toEqual([])
  })
})

describe('resolveLookupKey', () => {
  it('按 plan + 周期取到对应 key', () => {
    expect(resolveLookupKey(lookupKeyMap, 'pro_monthly', 'month')).toBe('pro_monthly')
    expect(resolveLookupKey(lookupKeyMap, 'pro_monthly', 'year')).toBe('pro_yearly')
    expect(resolveLookupKey(lookupKeyMap, 'lifetime', 'one_time')).toBe('lifetime')
  })

  it('未配置的周期返回 undefined，不跨周期回退', () => {
    const partial = buildLookupKeyMap({ VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly' })
    // 年付没配时不能回退到月付价。
    expect(resolveLookupKey(partial, 'pro_monthly', 'year')).toBeUndefined()
  })

  it('未知 plan 返回 undefined', () => {
    expect(resolveLookupKey(lookupKeyMap, 'enterprise', 'month')).toBeUndefined()
  })

  it('缺 interval 时返回 undefined', () => {
    expect(resolveLookupKey(lookupKeyMap, 'pro_monthly')).toBeUndefined()
  })
})

describe('isPlanPurchasable', () => {
  it('没有任何 key 时不可购买', () => {
    expect(isPlanPurchasable('pro_monthly', {})).toBe(false)
    expect(isPlanPurchasable('free', {})).toBe(false)
  })

  it('有至少一个非空 key 时可购买', () => {
    expect(
      isPlanPurchasable(
        'pro_monthly',
        buildLookupKeyMap({ VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly' }),
      ),
    ).toBe(true)
  })

  it('映射里全是空串时不可购买', () => {
    expect(isPlanPurchasable('pro_monthly', { pro_monthly: { month: '' } })).toBe(false)
  })
})

describe('availableIntervals', () => {
  it('按月付与年付都配好时按固定顺序返回', () => {
    const map = buildLookupKeyMap({
      VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly',
      VITE_STRIPE_LOOKUP_PRO_YEARLY: 'pro_yearly',
    })
    expect(availableIntervals(map, 'pro_monthly')).toEqual(['month', 'year'])
  })

  it('只配月付时不返回 year —— 定价页不应出现点了就 502 的选项', () => {
    const map = buildLookupKeyMap({ VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly' })
    expect(availableIntervals(map, 'pro_monthly')).toEqual(['month'])
  })

  it('一次性方案只返回 one_time', () => {
    const map = buildLookupKeyMap({ VITE_STRIPE_LOOKUP_LIFETIME: 'lifetime' })
    expect(availableIntervals(map, 'lifetime')).toEqual(['one_time'])
  })

  it('空串 key 不计入可用周期', () => {
    expect(availableIntervals({ pro_monthly: { month: '' } }, 'pro_monthly')).toEqual([])
  })

  it('未知 plan 返回空数组', () => {
    expect(availableIntervals(lookupKeyMap, 'unknown_plan')).toEqual([])
  })
})

describe('findPlanIdByLookupKey', () => {
  it('月付与年付都映射回同一个 plan', () => {
    expect(findPlanIdByLookupKey(lookupKeyMap, 'pro_monthly')).toBe('pro_monthly')
    expect(findPlanIdByLookupKey(lookupKeyMap, 'pro_yearly')).toBe('pro_monthly')
  })

  it('一次性 key 映射回 lifetime', () => {
    expect(findPlanIdByLookupKey(lookupKeyMap, 'lifetime')).toBe('lifetime')
  })

  it('映射里没有的 key 返回 undefined —— 不假装认识手工创建的 Price', () => {
    expect(findPlanIdByLookupKey(lookupKeyMap, 'unknown')).toBeUndefined()
  })
})

describe('findOrphanPlanIds', () => {
  it('映射里的 plan 都在定价页时返回空', () => {
    const map = buildLookupKeyMap({
      VITE_STRIPE_LOOKUP_PRO_MONTHLY: 'pro_monthly',
      VITE_STRIPE_LOOKUP_LIFETIME: 'lifetime',
    })
    expect(findOrphanPlanIds(map)).toEqual([])
  })

  it('返回定价页上不存在的 plan id', () => {
    expect(findOrphanPlanIds({ enterprise: { month: 'ent_monthly' } })).toEqual(['enterprise'])
  })
})

/**
 * 价格目录的纯逻辑：方案定义 + lookup key + Stripe 价格 → 可渲染的定价方案。
 */
describe('mergePricingPlans', () => {
  const catalog: PriceCatalog = {
    pro_monthly: { priceId: 'price_m', amount: 990, currency: 'usd', recurring: true },
    pro_yearly: { priceId: 'price_y', amount: 9900, currency: 'usd', recurring: true },
    lifetime: { priceId: 'price_life', amount: 9900, currency: 'usd', recurring: false },
  }

  const definitions = [
    {
      id: 'pro_monthly',
      name: 'Pro',
      features: ['a'],
      cta: { label: 'Buy', href: '/register' },
    },
    {
      id: 'lifetime',
      name: 'Lifetime',
      features: ['b'],
      cta: { label: 'Buy', href: '/register' },
    },
  ]

  it('金额来自 Stripe，不是写死的文案', () => {
    const plans = mergePricingPlans(definitions, catalog, lookupKeyMap)
    const pro = plans.find((plan) => plan.id === 'pro_monthly')
    expect(pro?.prices.map((price) => [price.interval, price.amount])).toEqual([
      ['month', 990],
      ['year', 9900],
    ])
    expect(pro?.prices[0]?.currency).toBe('usd')
  })

  it('一次买断方案只有一个周期', () => {
    const plans = mergePricingPlans(definitions, catalog, lookupKeyMap)
    const lifetime = plans.find((plan) => plan.id === 'lifetime')
    expect(lifetime?.prices).toHaveLength(1)
    expect(lifetime?.prices[0]?.interval).toBe('one_time')
  })

  it('目录里缺某个 key 时该周期不展示（其余周期照常）', () => {
    const partial: PriceCatalog = {
      pro_monthly: { priceId: 'price_m', amount: 990, currency: 'usd', recurring: true },
    }
    const plans = mergePricingPlans(definitions, partial, lookupKeyMap)
    const pro = plans.find((plan) => plan.id === 'pro_monthly')
    expect(pro?.prices.map((price) => price.interval)).toEqual(['month'])
  })

  it('目录为空时方案仍在，只是没有价格', () => {
    const plans = mergePricingPlans(definitions, {}, lookupKeyMap)
    expect(plans).toHaveLength(2)
    expect(plans.every((plan) => plan.prices.length === 0)).toBe(true)
  })

  it('保留方案定义的名称、卖点与 CTA', () => {
    const plans = mergePricingPlans(definitions, catalog, lookupKeyMap)
    expect(plans[0]?.name).toBe('Pro')
    expect(plans[0]?.features).toEqual(['a'])
    expect(plans[0]?.cta.href).toBe('/register')
  })
})

describe('buildPlanIdByPriceId', () => {
  const catalog: PriceCatalog = {
    pro_monthly: { priceId: 'price_m', amount: 990, currency: 'usd', recurring: true },
    lifetime: { priceId: 'price_life', amount: 9900, currency: 'usd', recurring: false },
  }

  it('Price id 反查回 plan id', () => {
    expect(buildPlanIdByPriceId(catalog, lookupKeyMap)).toEqual({
      price_m: 'pro_monthly',
      price_life: 'lifetime',
    })
  })

  it('目录外的 Price id 查不到 —— 不编造套餐', () => {
    expect(buildPlanIdByPriceId(catalog, lookupKeyMap).price_unknown).toBeUndefined()
  })
})
