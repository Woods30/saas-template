import { getPricingPlans } from '@/config/pricing'

/**
 * 定价方案 ↔ Stripe Price ID 的显式映射。
 *
 * 不能用「plan id 拼 price id」：同一 plan 有月付 / 年付多个 Price，缺失时必须
 * 明确失败而非静默回退，否则用户会按错误价位付款。`mode` 与 `interval` 也必须自洽。
 */

/** plan id →（计费周期 → Stripe Price ID）。 */
export type PriceMap = Record<string, Partial<Record<'month' | 'year' | 'one_time', string>>>

/**
 * 从公开 env 派生 Price 映射，只放行至少有一个非空 Price 的 plan。
 *
 * 未配置任何 Price ID 时返回空映射，结账入口由 `payment.enabled` 一并挡下，
 * 不会出现「能点但 502」。
 */
export function buildPriceMap(env: {
  VITE_STRIPE_PRICE_PRO_MONTHLY?: string
  VITE_STRIPE_PRICE_PRO_YEARLY?: string
  VITE_STRIPE_PRICE_LIFETIME?: string
}): PriceMap {
  const map: PriceMap = {}
  // 不要抽成内部 helper：`tsx` 对嵌套箭头函数会注入 `__name`，部分运行方式下
  // 未定义，导致 `scripts/check-env.ts` 这类直接跑 TS 的入口在加载期就崩。
  if (env.VITE_STRIPE_PRICE_PRO_MONTHLY?.trim()) {
    map.pro_monthly = { month: env.VITE_STRIPE_PRICE_PRO_MONTHLY }
  }
  if (env.VITE_STRIPE_PRICE_PRO_YEARLY?.trim()) {
    map.pro_monthly = { ...map.pro_monthly, year: env.VITE_STRIPE_PRICE_PRO_YEARLY }
  }
  if (env.VITE_STRIPE_PRICE_LIFETIME?.trim()) {
    map.lifetime = { one_time: env.VITE_STRIPE_PRICE_LIFETIME }
  }
  return map
}

/**
 * 把价格映射汇总成 `/api/payment` 的 Price 白名单，去重保序、空值不入列。
 *
 * 必须与 `priceMap` 由同一份 env 派生：白名单与取价依据分家是「点了 502」的典型成因。
 */
export function collectPriceIds(map: PriceMap): string[] {
  const ids = Object.values(map).flatMap((periods) => Object.values(periods ?? {}))
  return [...new Set(ids.filter((id): id is string => Boolean(id?.trim())))]
}

/** plan id + 计费周期 → Stripe Price ID；任一缺失返回 `undefined`。 */
export function resolvePriceId(
  map: PriceMap,
  planId: string,
  interval?: string,
): string | undefined {
  const periods = map[planId]
  if (!periods) return undefined
  return periods[interval as keyof typeof periods]
}

/** 该 plan 的计费模式：有 `one_time` Price 视为一次性买断，其余按订阅。 */
export function resolveMode(planId: string, priceMap: PriceMap): 'subscription' | 'payment' {
  return priceMap[planId]?.one_time ? 'payment' : 'subscription'
}

/**
 * plan 在定价页是否可购买。
 *
 * 未配置 Price ID 时按钮降级为「先注册」，避免给用户一个点了就 502 的按钮。
 */
export function isPlanPurchasable(planId: string, priceMap: PriceMap): boolean {
  const periods = priceMap[planId]
  if (!periods) return false
  return Object.values(periods).some((id) => Boolean(id?.trim()))
}

/**
 * 定价页方案与 Price 映射的一致性自检，返回页面上找不到的 plan id。
 *
 * Price 配了但页面没有对应方案时，用户永远买不到，配置却显示「完整」。
 */
export function findOrphanPlanIds(priceMap: PriceMap): string[] {
  const known = new Set(getPricingPlans().map((plan) => plan.id))
  return Object.keys(priceMap).filter((planId) => !known.has(planId))
}

/**
 * 该 plan 实际可购买的计费周期，顺序固定为 `month` → `year` → `one_time`。
 *
 * 周期切换器、`startCheckout()` 的默认周期、「已订阅后能否再买」都从这一个函数取；
 * 各处自行读 `prices[0].interval` 会不一致（症状：年付配好了却永远只提交月付）。
 * 只返回有非空 Price 的周期，避免切换器出现点了就 502 的选项。
 */
export function availableIntervals(
  priceMap: PriceMap,
  planId: string,
): Array<'month' | 'year' | 'one_time'> {
  const periods = priceMap[planId]
  if (!periods) return []
  const order = ['month', 'year', 'one_time'] as const
  return order.filter((interval) => Boolean(periods[interval]?.trim()))
}

/**
 * Price ID → 定价页 plan id，账单页用它显示「用户买的是哪个套餐」。
 *
 * 未匹配时返回 `undefined`：Price 可能是手工在 Stripe 后台创建的，不该假装认识它。
 */
export function findPlanIdByPriceId(priceMap: PriceMap, priceId: string): string | undefined {
  for (const [planId, periods] of Object.entries(priceMap)) {
    if (Object.values(periods ?? {}).includes(priceId)) return planId
  }
  return undefined
}
