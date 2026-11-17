import { describe, expect, it } from 'vitest'
import { getProducts } from '@/config/products'
import {
  isOneTimePriceValid,
  LANDING_PRICE_CURRENCY,
  mergePricingProducts,
} from '@/core/payment/price-catalog'

// 捕获价格选项丢失、按本地周期猜测计费方式，以及重复维护配置的问题。
describe('扁平套餐目录', () => {
  it('首页售卖的商品只允许一次性价格，金额以 Stripe 目录为准', () => {
    const price = {
      priceId: 'p_template',
      reference: 'one_time',
      amount: 9900,
      currency: 'usd',
      mode: 'payment',
      interval: null,
      intervalCount: null,
    } as const
    expect(isOneTimePriceValid(price)).toBe(true)
    expect(isOneTimePriceValid(undefined)).toBe(false)
    // 金额不再与配置里的第二份金额比对：目录里的金额就是事实源。
    expect(isOneTimePriceValid({ ...price, amount: 16900 })).toBe(true)
    expect(isOneTimePriceValid({ ...price, mode: 'subscription', interval: 'month' })).toBe(false)
    // 模板出厂的价格引用是占位值：使用者要换成自己在 Stripe 建的一次性价格。
    expect(getProducts().find((product) => product.id === 'template')?.prices).toEqual({
      once: 'one_time',
    })
  })

  it('指定币种时按币种校验', () => {
    const price = {
      priceId: 'p_template',
      reference: 'one_time',
      amount: 9900,
      currency: 'usd',
      mode: 'payment',
      interval: null,
      intervalCount: null,
    } as const

    expect(isOneTimePriceValid(price, { currency: LANDING_PRICE_CURRENCY })).toBe(true)
    expect(isOneTimePriceValid({ ...price, currency: 'eur' }, { currency: 'usd' })).toBe(false)
    // 不传币种时不限制：模板工程不假设某个币种，币种由实例自己决定。
    expect(isOneTimePriceValid({ ...price, currency: 'eur' })).toBe(true)
  })
  it('同一套餐声明直接参与取价，保留选项 ID 和真实计费信息', () => {
    const products = [
      {
        id: 'example',
        name: 'Example',
        features: [],
        prices: { monthly: 'price_a', once: 'price_b' },
      },
    ]
    const catalog = {
      price_a: {
        priceId: 'p1',
        reference: 'price_a',
        amount: 1200,
        currency: 'usd',
        mode: 'subscription',
        interval: 'month',
        intervalCount: 1,
      },
      price_b: {
        priceId: 'p2',
        reference: 'price_b',
        amount: 9000,
        currency: 'usd',
        mode: 'payment',
        interval: null,
        intervalCount: null,
      },
    } as const
    const result = mergePricingProducts(products, catalog)
    expect(result[0]?.options).toMatchObject([
      { id: 'monthly', amount: 1200, kind: 'subscription', interval: 'month' },
      { id: 'once', amount: 9000, kind: 'one_time' },
    ])
  })

  it('免费套餐和付费套餐都使用一份 prices 定义', () => {
    const products = getProducts()
    expect(products.find((p) => p.id === 'free')?.prices).toEqual({})
    expect(products.find((p) => p.id === 'pro')?.prices).toEqual({
      monthly: 'pro_monthly',
      yearly: 'pro_yearly',
    })
  })

  it('缺失价格不产生可购买的选项', () => {
    expect(
      mergePricingProducts(
        [{ id: 'a', name: 'A', features: [], prices: { monthly: 'missing' } }],
        {},
      )[0]?.options,
    ).toEqual([])
  })
})
