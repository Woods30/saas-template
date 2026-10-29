import { findOfferByReference, pricingIntervalLabel } from '@/config/products'
import { websiteConfig } from '@/config/website'
import type { PricingInterval, PricingProduct, ProductDefinition } from '@/types/pricing'

export interface CatalogPrice {
  priceId: string
  reference: string
  amount: number
  currency: string
  mode: 'subscription' | 'payment'
  interval: Exclude<PricingInterval, 'one_time'> | null
  intervalCount: number | null
}

export type PriceCatalog = Record<string, CatalogPrice>

/** 模板展示价格必须与实际一次性收款一致，不匹配时拒绝结账。 */
export function isTemplatePriceValid(price: CatalogPrice | undefined): boolean {
  return (
    !!price &&
    price.mode === 'payment' &&
    price.currency === 'usd' &&
    price.amount === Math.round(websiteConfig.template.priceUsd * 100)
  )
}

export function mergePricingProducts(
  definitions: ProductDefinition[],
  catalog: PriceCatalog,
): PricingProduct[] {
  return definitions.map((product) => ({
    ...product,
    options: Object.entries(product.prices).flatMap(([id, reference]) => {
      const price = catalog[reference]
      if (!price) return []
      const interval = price.mode === 'payment' ? 'one_time' : (price.interval ?? undefined)
      return [
        {
          id,
          kind: price.mode === 'subscription' ? ('subscription' as const) : ('one_time' as const),
          interval,
          intervalCount: price.intervalCount ?? undefined,
          amount: price.amount,
          currency: price.currency,
          label: interval ? pricingIntervalLabel(interval) : '',
        },
      ]
    }),
  }))
}

export function buildProductIdByPriceId(catalog: PriceCatalog): Record<string, string> {
  const result: Record<string, string> = {}
  for (const price of Object.values(catalog)) {
    const offer = findOfferByReference(price.reference)
    if (offer) result[price.priceId] = offer.productId
  }
  return result
}
