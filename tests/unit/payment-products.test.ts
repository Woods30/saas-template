import { describe, expect, it } from 'vitest'
import { getProducts } from '@/config/products'
import { isTemplatePriceValid, mergePricingProducts } from '@/payment/price-catalog'

// 捕获价格选项丢失、按本地周期猜测计费方式，以及重复维护配置的问题。
describe('扁平套餐目录', () => {
  it('模板只允许与首页一致的 USD 99 一次性价格', () => {
    const price = {
      priceId: 'p_template',
      reference: 'jerbix_template',
      amount: 9900,
      currency: 'usd',
      mode: 'payment',
      interval: null,
      intervalCount: null,
    } as const
    expect(isTemplatePriceValid(price)).toBe(true)
    expect(isTemplatePriceValid(undefined)).toBe(false)
    expect(isTemplatePriceValid({ ...price, amount: 16900 })).toBe(false)
    expect(isTemplatePriceValid({ ...price, currency: 'eur' })).toBe(false)
    expect(isTemplatePriceValid({ ...price, mode: 'subscription', interval: 'month' })).toBe(false)
    expect(getProducts().find((product) => product.id === 'template')?.prices).toEqual({
      once: 'jerbix_template',
    })
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
