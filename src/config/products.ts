import { m } from '@/locale/paraglide/messages.js'
import type { PricingInterval, ProductDefinition } from '@/types/pricing'

/** 套餐只定义一次；prices 的值是当前服务商的销售引用（Stripe lookup_key）。 */
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
      name: 'Jerbix',
      description: m.home_pricing_description(),
      features: [m.home_pricing_source(), m.home_pricing_support(), m.home_pricing_updates()],
      prices: { once: 'jerbix_template' },
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

export function pricingIntervalLabel(interval: PricingInterval): string {
  if (interval === 'month') return m.pricing_per_month()
  if (interval === 'year') return m.pricing_per_year()
  if (interval === 'one_time') return m.pricing_one_time()
  return interval
}
