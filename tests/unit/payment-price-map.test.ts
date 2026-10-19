import { describe, expect, it } from 'vitest'
import {
  availableIntervals,
  buildPriceMap,
  findOrphanPlanIds,
  findPlanIdByPriceId,
  isPlanPurchasable,
  resolveMode,
  resolvePriceId,
} from '@/config/payment'

/**
 * 定价方案 ↔ Stripe Price ID 的映射。
 *
 * 这一层是「定价页能点」与「点了能付款」之间的唯一桥。四类错误都会让用户付错钱
 * 或点了就 502，因此逐条守住：
 * - 空字符串不能当成有效 Price（`.env` 里留空的变量会被 Vite 注入为 `''`）；
 * - 周期与 Price 必须配对，不能把年付价当周付价；
 * - 没有 Price 的 plan 不得标记为可购买；
 * - 映射里的 plan id 必须在定价页存在。
 */

describe('buildPriceMap', () => {
  it('全空时返回空映射', () => {
    expect(buildPriceMap({})).toEqual({})
  })

  it('空字符串视为未配置', () => {
    expect(
      buildPriceMap({
        VITE_STRIPE_PRICE_PRO_MONTHLY: '',
        VITE_STRIPE_PRICE_PRO_YEARLY: '   ',
        VITE_STRIPE_PRICE_LIFETIME: '',
      }),
    ).toEqual({})
  })

  it('按月付与年付分别落到 pro_monthly 的不同周期', () => {
    expect(
      buildPriceMap({
        VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m',
        VITE_STRIPE_PRICE_PRO_YEARLY: 'price_y',
      }),
    ).toEqual({ pro_monthly: { month: 'price_m', year: 'price_y' } })
  })

  it('lifetime 落到 one_time', () => {
    expect(buildPriceMap({ VITE_STRIPE_PRICE_LIFETIME: 'price_life' })).toEqual({
      lifetime: { one_time: 'price_life' },
    })
  })

  it('只配一个周期时不补另一个周期', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })
    expect(map.pro_monthly).toEqual({ month: 'price_m' })
    expect(map.pro_monthly?.year).toBeUndefined()
  })
})

describe('resolvePriceId', () => {
  const map = buildPriceMap({
    VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m',
    VITE_STRIPE_PRICE_PRO_YEARLY: 'price_y',
    VITE_STRIPE_PRICE_LIFETIME: 'price_life',
  })

  it('按 plan + 周期取到对应 Price', () => {
    expect(resolvePriceId(map, 'pro_monthly', 'month')).toBe('price_m')
    expect(resolvePriceId(map, 'pro_monthly', 'year')).toBe('price_y')
    expect(resolvePriceId(map, 'lifetime', 'one_time')).toBe('price_life')
  })

  it('未配置的周期返回 undefined，不跨周期回退', () => {
    const partial = buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })
    // 年付没配时不能回退到月付价：用户会按年付按钮买成月付。
    expect(resolvePriceId(partial, 'pro_monthly', 'year')).toBeUndefined()
  })

  it('未知 plan 返回 undefined', () => {
    expect(resolvePriceId(map, 'enterprise', 'month')).toBeUndefined()
  })

  it('缺 interval 时返回 undefined', () => {
    expect(resolvePriceId(map, 'pro_monthly')).toBeUndefined()
  })
})

describe('resolveMode', () => {
  it('有 one_time Price 时是 payment', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_LIFETIME: 'price_life' })
    expect(resolveMode('lifetime', map)).toBe('payment')
  })

  it('只有周期 Price 时是 subscription', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })
    expect(resolveMode('pro_monthly', map)).toBe('subscription')
  })

  it('未知 plan 按 subscription 处理（由可购买性再挡一次）', () => {
    expect(resolveMode('nope', {})).toBe('subscription')
  })
})

describe('isPlanPurchasable', () => {
  it('没有任何 Price 时不可购买', () => {
    expect(isPlanPurchasable('pro_monthly', {})).toBe(false)
    expect(isPlanPurchasable('free', {})).toBe(false)
  })

  it('有至少一个非空 Price 时可购买', () => {
    expect(
      isPlanPurchasable('pro_monthly', buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })),
    ).toBe(true)
  })

  it('映射里全是空串时不可购买', () => {
    expect(isPlanPurchasable('pro_monthly', { pro_monthly: { month: '' } })).toBe(false)
  })
})

describe('availableIntervals', () => {
  it('按月付与年付都配好时按固定顺序返回', () => {
    const map = buildPriceMap({
      VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m',
      VITE_STRIPE_PRICE_PRO_YEARLY: 'price_y',
    })
    expect(availableIntervals(map, 'pro_monthly')).toEqual(['month', 'year'])
  })

  it('只配月付时不返回 year —— 定价页不应出现点了就 502 的选项', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })
    expect(availableIntervals(map, 'pro_monthly')).toEqual(['month'])
  })

  it('一次性方案只返回 one_time', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_LIFETIME: 'price_life' })
    expect(availableIntervals(map, 'lifetime')).toEqual(['one_time'])
  })

  it('空串 Price 不计入可用周期', () => {
    expect(availableIntervals({ pro_monthly: { month: '' } }, 'pro_monthly')).toEqual([])
  })

  it('未知 plan 返回空数组', () => {
    const map = buildPriceMap({ VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m' })
    expect(availableIntervals(map, 'unknown_plan')).toEqual([])
  })
})

describe('findPlanIdByPriceId', () => {
  const map = buildPriceMap({
    VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m',
    VITE_STRIPE_PRICE_PRO_YEARLY: 'price_y',
    VITE_STRIPE_PRICE_LIFETIME: 'price_life',
  })

  it('月付与年付都映射回同一个 plan', () => {
    expect(findPlanIdByPriceId(map, 'price_m')).toBe('pro_monthly')
    expect(findPlanIdByPriceId(map, 'price_y')).toBe('pro_monthly')
  })

  it('一次性 Price 映射回 lifetime', () => {
    expect(findPlanIdByPriceId(map, 'price_life')).toBe('lifetime')
  })

  it('映射里没有的 Price 返回 undefined —— 不假装认识手工创建的 Price', () => {
    expect(findPlanIdByPriceId(map, 'price_unknown')).toBeUndefined()
  })
})

describe('findOrphanPlanIds', () => {
  it('映射里的 plan 都在定价页时返回空', () => {
    const map = buildPriceMap({
      VITE_STRIPE_PRICE_PRO_MONTHLY: 'price_m',
      VITE_STRIPE_PRICE_LIFETIME: 'price_life',
    })
    expect(findOrphanPlanIds(map)).toEqual([])
  })

  it('返回定价页上不存在的 plan id', () => {
    expect(findOrphanPlanIds({ enterprise: { month: 'price_e' } })).toEqual(['enterprise'])
  })
})
