import { availableIntervals, findPlanIdByLookupKey, type LookupKeyMap } from '@/config/payment'
import { pricingIntervalLabel } from '@/config/pricing'
import { websiteConfig } from '@/config/website'
import type { PricingPlan, PricingPlanDefinition } from '@/types/pricing'

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
}

/** lookup_key → 价格。 */
export type PriceCatalog = Record<string, CatalogPrice>

/**
 * 方案定义 + 价格目录 → 可渲染的定价方案。
 *
 * 三份数据各司其职：方案定义给名称与卖点，`lookup_key` 映射决定有哪些周期，
 * 价格目录给金额与币种。缺任何一份都只影响展示，不会算错钱——真正扣多少钱
 * 由 Stripe 侧的 Price 决定。
 */
export function mergePricingPlans(
  definitions: PricingPlanDefinition[],
  catalog: PriceCatalog,
  lookupKeyMap: LookupKeyMap = websiteConfig.payment.lookupKeyMap,
): PricingPlan[] {
  return definitions.map((definition) => {
    const prices = availableIntervals(lookupKeyMap, definition.id).flatMap((interval) => {
      const lookupKey = lookupKeyMap[definition.id]?.[interval]
      if (!lookupKey) return []
      const price = catalog[lookupKey]
      if (!price) return []
      return [
        {
          amount: price.amount,
          currency: price.currency,
          interval,
          label: pricingIntervalLabel(interval),
        },
      ]
    })
    return { ...definition, prices }
  })
}

/**
 * Price id → plan id 的反查表。
 *
 * 账单页与 webhook 手上只有 Stripe 的 Price id，要显示「用户买的是哪个套餐」
 * 只能反查。这里一次建表，避免每行订阅各查一次。
 */
export function buildPlanIdByPriceId(
  catalog: PriceCatalog,
  lookupKeyMap: LookupKeyMap = websiteConfig.payment.lookupKeyMap,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [lookupKey, price] of Object.entries(catalog)) {
    const planId = findPlanIdByLookupKey(lookupKeyMap, lookupKey)
    if (planId) result[price.priceId] = planId
  }
  return result
}
