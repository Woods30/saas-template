import type { CollectionPrice } from '@/collection/types'
import { m } from '@/locale/paraglide/messages.js'
import type { PricingInterval, ProductDefinition } from '@/types/pricing'

/**
 * 套餐只定义一次；prices 的值是当前服务商的销售引用。
 *
 * Stripe 把它当 Price 的 `lookup_key`；Creem 把它当本站引用，由 `CREEM_PRODUCTS`
 * 映射到 `prod_*` 商品 ID。代码里不出现任何渠道的 ID 或金额。
 */
export function getProducts(): ProductDefinition[] {
  return [
    {
      id: 'free',
      name: m.pricing_free_name(),
      description: m.pricing_free_description(),
      features: [m.pricing_free_feature_1(), m.pricing_free_feature_2()],
      prices: {},
    },
    {
      id: 'pro',
      name: m.pricing_pro_name(),
      description: m.pricing_pro_description(),
      features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
      recommended: true,
      prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
    },
    {
      id: 'lifetime',
      name: m.pricing_lifetime_name(),
      description: m.pricing_lifetime_description(),
      features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
      prices: { once: 'lifetime' },
    },
    {
      id: 'template',
      // 显示名：模板出厂是默认品牌，`pnpm run init` 会换成你自己的。
      name: 'Jerbix',
      description: m.home_pricing_description(),
      features: [m.home_pricing_source(), m.home_pricing_support(), m.home_pricing_updates()],
      // 价格引用：Stripe 下换成一次性价格的 lookup_key；Creem 下用 CREEM_PRODUCTS 映射。
      // 金额只存在于支付渠道，代码里不存第二份。
      prices: { once: 'one_time' },
      // 核销型链路的本地价格：金额单位是分。这是收款码链路的唯一金额事实源，
      // 与上面的渠道销售引用互不影响。
      collectionPrices: {
        once: { amount: 18_000, currency: 'cny', kind: 'one_time' },
      },
    },
  ]
}

export function findProduct(productId: string): ProductDefinition | undefined {
  return getProducts().find((product) => product.id === productId)
}

export function resolvePriceReference(productId: string, offerId: string): string | undefined {
  const prices = findProduct(productId)?.prices
  return prices && Object.hasOwn(prices, offerId) ? prices[offerId] : undefined
}

export function collectPriceReferences(): string[] {
  return [...new Set(getProducts().flatMap((product) => Object.values(product.prices)))]
}

export function findOfferByReference(
  reference: string,
): { productId: string; offerId: string } | undefined {
  for (const product of getProducts()) {
    for (const [offerId, value] of Object.entries(product.prices)) {
      if (value === reference) return { productId: product.id, offerId }
    }
  }
  return undefined
}

export function productConfigErrors(products = getProducts()): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const refs = new Set<string>()
  for (const product of products) {
    if (!product.id.trim() || ids.has(product.id)) errors.push(`duplicateProduct.${product.id}`)
    ids.add(product.id)
    for (const [offer, reference] of Object.entries(product.prices)) {
      if (!offer.trim() || !reference.trim()) errors.push(`emptyPrice.${product.id}.${offer}`)
      if (refs.has(reference)) errors.push(`duplicatePrice.${reference}`)
      refs.add(reference)
    }
  }
  return errors
}

/**
 * 核销型价格是否合法。
 *
 * 规则来自 spec：金额是正整数分、币种固定人民币、一次性价格不声明周期、
 * 订阅价格声明周期与正的周期数。
 */
function isValidCollectionPrice(price: CollectionPrice): boolean {
  if (!Number.isInteger(price.amount) || price.amount <= 0) return false
  if (price.currency !== 'cny') return false
  if (price.kind === 'one_time')
    return price.interval === undefined && price.intervalCount === undefined
  if (price.kind === 'subscription') {
    return (
      (price.interval === 'month' || price.interval === 'year') &&
      Number.isInteger(price.intervalCount) &&
      (price.intervalCount ?? 0) > 0
    )
  }
  return false
}

/**
 * 取某个商品某个付费方式在核销型链路下的本地价格。
 *
 * 金额只存在 `collectionPrices` 这一处，单位是分；非法配置返回 `undefined`，
 * 不让坏金额流进下单链路。
 */
export function resolveCollectionPrice(
  productId: string,
  offerId: string,
): CollectionPrice | undefined {
  const prices = getProducts().find((product) => product.id === productId)?.collectionPrices
  if (!prices || !Object.hasOwn(prices, offerId)) return undefined
  const price = prices[offerId]
  if (!price) return undefined
  return isValidCollectionPrice(price) ? price : undefined
}

/**
 * 校验核销型价格配置。
 *
 * 错误键格式与 `productConfigErrors` 一致：`前缀.商品.付费方式`，
 * 例如 `invalidCollectionAmount.template.once`。
 */
export function collectionConfigErrors(products = getProducts()): string[] {
  const errors: string[] = []
  for (const product of products) {
    for (const [offer, price] of Object.entries(product.collectionPrices ?? {})) {
      const key = `${product.id}.${offer}`
      if (!Number.isInteger(price.amount) || price.amount <= 0)
        errors.push(`invalidCollectionAmount.${key}`)
      if (price.currency !== 'cny') errors.push(`invalidCollectionCurrency.${key}`)
      if (price.kind === 'one_time') {
        if (price.interval !== undefined) errors.push(`invalidCollectionInterval.${key}`)
        if (price.intervalCount !== undefined) errors.push(`invalidCollectionIntervalCount.${key}`)
      } else if (price.kind === 'subscription') {
        if (price.interval !== 'month' && price.interval !== 'year')
          errors.push(`invalidCollectionInterval.${key}`)
        if (!Number.isInteger(price.intervalCount) || (price.intervalCount ?? 0) <= 0)
          errors.push(`invalidCollectionIntervalCount.${key}`)
      } else {
        errors.push(`invalidCollectionKind.${key}`)
      }
    }
  }
  return errors
}

export function pricingIntervalLabel(interval: PricingInterval): string {
  if (interval === 'month') return m.pricing_per_month()
  if (interval === 'year') return m.pricing_per_year()
  if (interval === 'one_time') return m.pricing_one_time()
  return interval
}
