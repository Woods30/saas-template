import {
  collectLookupKeys,
  findProductIdByLookupKey,
  pricingIntervalLabel,
  productOptions,
} from '@/config/products'
import type { PricingInterval, PricingProduct, ProductDefinition } from '@/types/pricing'

/**
 * 价格目录：Stripe Price 的当前值。
 *
 * 定价页展示的金额**必须**来自这里，不能写死在代码里。Stripe 官方原话：写死价格后
 * 「the process is often manual and requires you to deploy new code」，并推荐用 Price
 * 上的 `lookup_key` 作为页面与价格之间的锚点。
 *
 * 本模块是**纯逻辑**（无副作用、可直接单测）；真正打 Stripe API 的部分在
 * `price-catalog.server.ts`，对外的 server function 在 `pricing.ts`。
 */

/** Stripe Price 的展示摘要。 */
export interface CatalogPrice {
  /** Stripe Price id；结账时用它下单。 */
  priceId: string
  /** 以「分」为单位。 */
  amount: number
  currency: string
  /** 是否有 `recurring`：true 为订阅，false 为一次性付款。 */
  recurring: boolean
  /**
   * Stripe Product id。
   *
   * 只用于**自检**（产品配置与 Stripe 的 Product 分组是否一致）与**兜底互斥判定**：
   * 判定以产品配置为准，没声明时才用它兜底。
   */
  stripeProductId: string | null
}

/** lookup_key → 价格。 */
export type PriceCatalog = Record<string, CatalogPrice>

/**
 * 产品定义 + 价格目录 → 可渲染的定价产品。
 *
 * 三份数据各司其职：产品定义给名称与卖点，`options` 决定有哪些付费方式，
 * 价格目录给金额与币种。缺任何一份都只影响展示，不会算错钱——真正扣多少钱
 * 由 Stripe 侧的 Price 决定。
 */
export function mergePricingProducts(
  definitions: ProductDefinition[],
  catalog: PriceCatalog,
): PricingProduct[] {
  return definitions.map((definition) => {
    const options = definition.options.flatMap((option) => {
      const price = catalog[option.lookupKey]
      if (!price) return []
      return [
        {
          kind: option.kind,
          ...(option.interval ? { interval: option.interval } : {}),
          amount: price.amount,
          currency: price.currency,
          // 展示文案优先取配置里写的（一次性买断的「终身」因产品而异），
          // 没写才退回按周期生成的通用文案。
          label: option.label ?? (option.interval ? pricingIntervalLabel(option.interval) : ''),
        },
      ]
    })
    const { options: _options, ...rest } = definition
    return { ...rest, options }
  })
}

/**
 * Price id → 产品 id 的反查表。
 *
 * 账单页与 webhook 手上只有 Stripe 的 Price id，要显示「用户买的是哪个产品」
 * 只能反查。这里一次建表，避免每行订阅各查一次。
 */
export function buildProductIdByPriceId(catalog: PriceCatalog): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [lookupKey, price] of Object.entries(catalog)) {
    const productId = findProductIdByLookupKey(lookupKey)
    if (productId) result[price.priceId] = productId
  }
  return result
}

/**
 * 配置与 Stripe 的一致性自检：产品配置里的付费方式分属几个 Stripe Product。
 *
 * 一个产品下的所有 Price 应当挂在**同一个** Stripe Product 上——这是「同一个东西的
 * 不同价位」在 Stripe 侧的事实依据，也是没写 `exclusiveWith` 时的判定兜底。
 * 返回 `null` 表示一致（或数据不足，无法判定）。
 */
export function productGroupMismatch(
  definition: ProductDefinition,
  catalog: PriceCatalog,
): { expected: string; found: string[] } | null {
  const productIds = productOptions(definition.id)
    .map((option) => catalog[option.lookupKey]?.stripeProductId)
    .filter((id): id is string => Boolean(id))
  const unique = [...new Set(productIds)]
  if (unique.length <= 1) return null
  return { expected: unique[0] ?? '', found: unique }
}

export type { PricingInterval, PricingProduct }
/** 所有产品的 lookup key（转调配置，便于调用方只 import 一个模块）。 */
export { collectLookupKeys }
