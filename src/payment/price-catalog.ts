import {
  findOfferByReference,
  pricingIntervalLabel,
  resolvePriceReference,
} from '@/config/products'
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

/**
 * 模板买断必须是可用的**一次性美元价格**。
 *
 * 不再比对配置里的金额：价格的唯一事实源是 Stripe，页面展示与结账收款读的是
 * 同一份目录。配置里再存一份金额，只会造成「改了 Stripe、结账被拦」——
 * 而这类不一致的报错信息还容易被误解成「方案没开放购买」。
 */
export function isTemplatePriceValid(price: CatalogPrice | undefined): boolean {
  return !!price && price.mode === 'payment' && price.currency === 'usd'
}

/**
 * 从价格目录里取某个产品某个付费方式的金额（分）。
 *
 * 付费方式由 `config/products.ts` 的产品 → 销售引用映射决定，与结账走同一条路径。
 */
export function findCatalogAmount(
  catalog: PriceCatalog,
  productId: string,
  offerId: string,
): number | null {
  const reference = resolvePriceReference(productId, offerId)
  if (!reference) return null
  return catalog[reference]?.amount ?? null
}

/** 金额（分）→ 展示用的美元串；整数金额不带小数位。 */
export function formatUsdAmount(amountCents: number | null): string {
  if (amountCents === null) return ''
  const usd = amountCents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(usd) ? 0 : 2,
  }).format(usd)
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
