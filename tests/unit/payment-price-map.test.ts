import { describe, expect, it } from 'vitest'
import {
  collectPriceReferences,
  findOfferByReference,
  productConfigErrors,
  resolvePriceReference,
} from '@/config/products'
import { buildProductIdByPriceId } from '@/payment/price-catalog'

describe('套餐销售引用', () => {
  it('产品与选项共同限制可购买引用，不能选择未知选项或对象原型', () => {
    expect(resolvePriceReference('pro', 'monthly')).toBe('pro_monthly')
    expect(resolvePriceReference('pro', 'missing')).toBeUndefined()
    expect(resolvePriceReference('pro', '__proto__')).toBeUndefined()
  })
  it('重复引用在去重前被检测', () => {
    expect(
      productConfigErrors([
        { id: 'a', name: 'A', features: [], prices: { month: 'same' } },
        { id: 'b', name: 'B', features: [], prices: { once: 'same' } },
      ]),
    ).toEqual(['duplicatePrice.same'])
  })
  it('引用反查包含产品及选项', () => {
    expect(findOfferByReference('pro_yearly')).toEqual({ productId: 'pro', offerId: 'yearly' })
    expect(collectPriceReferences()).toContain('pro_yearly')
    expect(
      buildProductIdByPriceId({
        pro_monthly: {
          reference: 'pro_monthly',
          priceId: 'p1',
          amount: 100,
          currency: 'usd',
          mode: 'subscription',
          interval: 'month',
          intervalCount: 1,
        },
      }),
    ).toEqual({ p1: 'pro' })
  })
})
