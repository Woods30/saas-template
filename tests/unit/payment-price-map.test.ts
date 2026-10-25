import { describe, expect, it } from 'vitest'
import {
  collectLookupKeys,
  compareProductTier,
  exclusiveProductIds,
  findDuplicateLookupKeys,
  findProductIdByLookupKey,
  findUnknownExclusiveRefs,
  findUnknownTierRefs,
  isExclusiveProduct,
  isProductPurchasable,
  productExclusivityMap,
  productIntervals,
  productOptions,
  productTier,
  productTierMap,
  resolveLookupKey,
} from '@/config/products'
import {
  buildProductIdByPriceId,
  mergePricingProducts,
  type PriceCatalog,
  productGroupMismatch,
} from '@/payment/price-catalog'
import type { ProductDefinition } from '@/types/pricing'

/**
 * 产品配置 ↔ Stripe Price `lookup_key` 映射。
 *
 * `lookup_key` 写在 `src/config/products.ts`（不在 env），它是「页面 ↔ 价格」的唯一
 * 锚点：一个产品下的多个付费方式（月付 / 年付 / 买断）各自对应一个 key。
 */

describe('产品配置的付费方式', () => {
  it('专业版配了月付与年付两种订阅周期', () => {
    expect(productOptions('pro').map((option) => option.lookupKey)).toEqual([
      'pro_monthly',
      'pro_yearly',
    ])
  })

  it('买断产品只有一次性付费方式', () => {
    expect(productOptions('lifetime').map((option) => option.kind)).toEqual(['one_time'])
  })

  it('免费档没有付费方式：按钮走注册而不是结账', () => {
    expect(productOptions('free')).toEqual([])
    expect(isProductPurchasable('free')).toBe(false)
  })

  it('配了付费方式的产品可购买', () => {
    expect(isProductPurchasable('pro')).toBe(true)
    expect(isProductPurchasable('lifetime')).toBe(true)
  })

  it('未知产品没有付费方式', () => {
    expect(productOptions('enterprise')).toEqual([])
    expect(isProductPurchasable('enterprise')).toBe(false)
  })
})

describe('productIntervals', () => {
  it('按固定顺序返回可用周期', () => {
    expect(productIntervals('pro')).toEqual(['month', 'year'])
  })

  it('买断产品只返回 one_time', () => {
    expect(productIntervals('lifetime')).toEqual(['one_time'])
  })

  it('未知产品返回空数组', () => {
    expect(productIntervals('enterprise')).toEqual([])
  })
})

describe('collectLookupKeys', () => {
  it('汇总所有产品的 key 并去重保序', () => {
    expect(collectLookupKeys()).toEqual(['pro_monthly', 'pro_yearly', 'lifetime'])
  })
})

describe('resolveLookupKey', () => {
  it('按产品 + 周期取到对应 key', () => {
    expect(resolveLookupKey('pro', 'month')).toBe('pro_monthly')
    expect(resolveLookupKey('pro', 'year')).toBe('pro_yearly')
    expect(resolveLookupKey('lifetime', 'one_time')).toBe('lifetime')
  })

  it('未配置的周期返回 undefined，不跨周期回退', () => {
    // 年付没配时不能回退到月付价。
    expect(resolveLookupKey('lifetime', 'year')).toBeUndefined()
  })

  it('未知产品返回 undefined', () => {
    expect(resolveLookupKey('enterprise', 'month')).toBeUndefined()
  })

  it('不给周期时取第一个已配置的付费方式', () => {
    expect(resolveLookupKey('pro')).toBe('pro_monthly')
  })
})

describe('findProductIdByLookupKey', () => {
  it('月付与年付都映射回同一个产品', () => {
    expect(findProductIdByLookupKey('pro_monthly')).toBe('pro')
    expect(findProductIdByLookupKey('pro_yearly')).toBe('pro')
  })

  it('一次性 key 映射回买断产品', () => {
    expect(findProductIdByLookupKey('lifetime')).toBe('lifetime')
  })

  it('配置里没有的 key 返回 undefined —— 不假装认识手工创建的 Price', () => {
    expect(findProductIdByLookupKey('unknown')).toBeUndefined()
  })
})

describe('产品等级', () => {
  it('等级按权限高低排：lifetime > pro > free', () => {
    expect(productTier('lifetime')).toBe(2)
    expect(productTier('pro')).toBe(1)
    expect(productTier('free')).toBe(0)
  })

  it('比较两个产品的等级', () => {
    expect(compareProductTier('lifetime', 'pro')).toBe(1)
    expect(compareProductTier('pro', 'lifetime')).toBe(-1)
    expect(compareProductTier('pro', 'pro')).toBe(0)
  })

  it('没配等级的产品不可比 —— 不参与等级比较', () => {
    expect(productTier('enterprise')).toBeUndefined()
    expect(compareProductTier('enterprise', 'pro')).toBeNull()
  })

  it('等级表里不能有不存在的产品', () => {
    // 写错产品 id 会让那个产品永远不参与等级比较，「高级别替换低级别」静默失效。
    expect(findUnknownTierRefs()).toEqual([])
  })

  it('等级表可以直接作为判定上下文', () => {
    expect(productTierMap()).toMatchObject({ free: 0, pro: 1, lifetime: 2 })
  })
})

describe('互斥关系', () => {
  it('等级不同的两个可购买产品自动互斥', () => {
    // 不必显式写：lifetime 等级高于 pro，买断后专业版就该停掉。
    expect(productExclusivityMap().lifetime).toEqual(['pro'])
    expect(productExclusivityMap().pro).toEqual(['lifetime'])
  })

  it('互斥是双向的：A 与 B 互斥，等于 B 与 A 互斥', () => {
    expect(isExclusiveProduct('lifetime', 'pro')).toBe(true)
    expect(isExclusiveProduct('pro', 'lifetime')).toBe(true)
  })

  it('免费档不参与互斥：它是默认状态，不可购买', () => {
    expect(isExclusiveProduct('pro', 'free')).toBe(false)
    expect(exclusiveProductIds('free')).toEqual([])
  })

  it('产品 id 缺失时不判定互斥', () => {
    expect(isExclusiveProduct(null, 'pro')).toBe(false)
    expect(isExclusiveProduct('lifetime', undefined)).toBe(false)
  })
})

describe('产品配置自检', () => {
  it('当前配置没有重复的 lookup key', () => {
    // 同一个 key 挂到两个产品上会让「Price → 产品」的反查有歧义。
    expect(findDuplicateLookupKeys()).toEqual([])
  })

  it('当前配置的互斥关系都指向存在的产品', () => {
    // 指向不存在的产品会让互斥静默失效：用户同时付两份钱却看不到提示。
    expect(findUnknownExclusiveRefs()).toEqual([])
  })
})

/**
 * 价格目录的纯逻辑：产品定义 + Stripe 价格 → 可渲染的定价产品。
 */
describe('mergePricingProducts', () => {
  const catalog: PriceCatalog = {
    pro_monthly: {
      priceId: 'price_m',
      amount: 990,
      currency: 'usd',
      recurring: true,
      stripeProductId: 'prod_pro',
    },
    pro_yearly: {
      priceId: 'price_y',
      amount: 9900,
      currency: 'usd',
      recurring: true,
      stripeProductId: 'prod_pro',
    },
    lifetime: {
      priceId: 'price_life',
      amount: 9900,
      currency: 'usd',
      recurring: false,
      stripeProductId: 'prod_lifetime',
    },
  }

  const definitions: ProductDefinition[] = [
    {
      id: 'pro',
      name: 'Pro',
      features: ['a'],
      cta: { label: 'Buy', href: '/register' },
      options: [
        { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
        { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
      ],
    },
    {
      id: 'lifetime',
      name: 'Lifetime',
      features: ['b'],
      cta: { label: 'Buy', href: '/register' },
      options: [{ kind: 'one_time', interval: 'one_time', lookupKey: 'lifetime' }],
    },
  ]

  it('金额来自 Stripe，不是写死的文案', () => {
    const products = mergePricingProducts(definitions, catalog)
    const pro = products.find((product) => product.id === 'pro')
    expect(pro?.options.map((option) => [option.interval, option.amount])).toEqual([
      ['month', 990],
      ['year', 9900],
    ])
    expect(pro?.options[0]?.currency).toBe('usd')
  })

  it('一个产品的多个付费方式归在同一个产品下', () => {
    // 月付与年付是同一个东西的两种价位，不是两个方案。
    const products = mergePricingProducts(definitions, catalog)
    expect(products).toHaveLength(2)
    expect(products.find((product) => product.id === 'pro')?.options).toHaveLength(2)
  })

  it('买断产品只有一个付费方式', () => {
    const products = mergePricingProducts(definitions, catalog)
    const lifetime = products.find((product) => product.id === 'lifetime')
    expect(lifetime?.options).toHaveLength(1)
    expect(lifetime?.options[0]?.interval).toBe('one_time')
  })

  it('目录里缺某个 key 时该付费方式不展示（其余照常）', () => {
    const partial: PriceCatalog = {
      pro_monthly: {
        priceId: 'price_m',
        amount: 990,
        currency: 'usd',
        recurring: true,
        stripeProductId: 'prod_pro',
      },
    }
    const products = mergePricingProducts(definitions, partial)
    const pro = products.find((product) => product.id === 'pro')
    expect(pro?.options.map((option) => option.interval)).toEqual(['month'])
  })

  it('目录为空时产品仍在，只是没有价格', () => {
    const products = mergePricingProducts(definitions, {})
    expect(products).toHaveLength(2)
    expect(products.every((product) => product.options.length === 0)).toBe(true)
  })

  it('保留产品定义的名称、卖点与 CTA', () => {
    const products = mergePricingProducts(definitions, catalog)
    expect(products[0]?.name).toBe('Pro')
    expect(products[0]?.features).toEqual(['a'])
    expect(products[0]?.cta.href).toBe('/register')
  })
})

describe('buildProductIdByPriceId', () => {
  const catalog: PriceCatalog = {
    pro_monthly: {
      priceId: 'price_m',
      amount: 990,
      currency: 'usd',
      recurring: true,
      stripeProductId: 'prod_pro',
    },
    lifetime: {
      priceId: 'price_life',
      amount: 9900,
      currency: 'usd',
      recurring: false,
      stripeProductId: 'prod_lifetime',
    },
  }

  it('Price id 反查回产品 id', () => {
    expect(buildProductIdByPriceId(catalog)).toEqual({
      price_m: 'pro',
      price_life: 'lifetime',
    })
  })

  it('目录外的 Price id 查不到 —— 不编造产品', () => {
    expect(buildProductIdByPriceId(catalog).price_unknown).toBeUndefined()
  })
})

describe('productGroupMismatch', () => {
  const definition: ProductDefinition = {
    id: 'pro',
    name: 'Pro',
    features: ['a'],
    cta: { label: 'Buy', href: '/register' },
    options: [
      { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
      { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
    ],
  }

  it('一个产品的付费方式都挂在同一个 Stripe Product 上时一致', () => {
    const catalog: PriceCatalog = {
      pro_monthly: {
        priceId: 'price_m',
        amount: 990,
        currency: 'usd',
        recurring: true,
        stripeProductId: 'prod_pro',
      },
      pro_yearly: {
        priceId: 'price_y',
        amount: 9900,
        currency: 'usd',
        recurring: true,
        stripeProductId: 'prod_pro',
      },
    }
    expect(productGroupMismatch(definition, catalog)).toBeNull()
  })

  it('跨到不同 Stripe Product 时报出不一致', () => {
    // 这是「月付 / 年付算升级还是两个东西」的事实依据，对不上就要在自检里暴露。
    const catalog: PriceCatalog = {
      pro_monthly: {
        priceId: 'price_m',
        amount: 990,
        currency: 'usd',
        recurring: true,
        stripeProductId: 'prod_a',
      },
      pro_yearly: {
        priceId: 'price_y',
        amount: 9900,
        currency: 'usd',
        recurring: true,
        stripeProductId: 'prod_b',
      },
    }
    expect(productGroupMismatch(definition, catalog)).toEqual({
      expected: 'prod_a',
      found: ['prod_a', 'prod_b'],
    })
  })
})
