import { createCacheKey, getOrSetCache } from '@/cache'
import { CACHE_TTL } from '@/cache/constants'
import { collectPriceReferences, findOfferByReference } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { getPaymentProvider } from '@/payment'
import type { PriceCatalog } from './price-catalog'

export async function getPriceCatalog(): Promise<PriceCatalog> {
  const references = collectPriceReferences()
  if (!references.length) return {}
  return getOrSetCache({
    key: createCacheKey(
      'payment',
      'price-catalog-v2',
      websiteConfig.payment.provider,
      JSON.stringify(references),
    ),
    ttlSeconds: CACHE_TTL.priceCatalog,
    fetcher: async () => {
      const prices = await getPaymentProvider(websiteConfig.payment.provider).listPrices(references)
      const catalog: PriceCatalog = {}
      for (const price of prices) {
        if (!price.reference || price.amount === null) continue
        catalog[price.reference] = { ...price, priceId: price.id, amount: price.amount }
      }
      return catalog
    },
  })
}

export async function findProductIdByPriceId(priceId: string): Promise<string | undefined> {
  const catalog = await getPriceCatalog()
  const price = Object.values(catalog).find((item) => item.priceId === priceId)
  return price ? findOfferByReference(price.reference)?.productId : undefined
}
