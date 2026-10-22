import { getPricingPlans } from '@/config/pricing'
import type { PricingInterval } from '@/types/pricing'

/**
 * 定价方案 ↔ Stripe Price 的 `lookup_key` 映射。
 *
 * 用 `lookup_key` 而不是 Price ID：Stripe 官方推荐用它做「页面展示价 ↔ 实际扣款价」
 * 的锚点——「If these prices are hard-coded and you want to change them, the process is
 * often manual and requires you to deploy new code. To better manage these scenarios, you
 * can use the `lookup_key` attribute on the Price object.」
 *
 * key 是价格的稳定对外名：改价时把 key 迁到新 Price 上（`transfer_lookup_key=true`），
 * 页面与代码都不用动；Price ID 一换就得改代码重新部署，且极易与后台配置漂移。
 *
 * 也不能用「plan id 拼 price id」：同一 plan 有月付 / 年付多个 Price，缺失时必须
 * 明确失败而非静默回退，否则用户会按错误价位付款。
 */

/** plan id →（计费周期 → Price 的 lookup_key）。 */
export type LookupKeyMap = Record<string, Partial<Record<PricingInterval, string>>>

/**
 * 从公开 env 派生 lookup key 映射，只放行至少有一个非空 key 的 plan。
 *
 * 未配置任何 key 时返回空映射，结账入口由 `payment.enabled` 一并挡下，
 * 不会出现「能点但 502」。
 */
export function buildLookupKeyMap(env: {
  VITE_STRIPE_LOOKUP_PRO_MONTHLY?: string
  VITE_STRIPE_LOOKUP_PRO_YEARLY?: string
  VITE_STRIPE_LOOKUP_LIFETIME?: string
}): LookupKeyMap {
  const map: LookupKeyMap = {}
  // 不要抽成内部 helper：`tsx` 对嵌套箭头函数会注入 `__name`，部分运行方式下
  // 未定义，导致 `scripts/check-env.ts` 这类直接跑 TS 的入口在加载期就崩。
  if (env.VITE_STRIPE_LOOKUP_PRO_MONTHLY?.trim()) {
    map.pro_monthly = { month: env.VITE_STRIPE_LOOKUP_PRO_MONTHLY }
  }
  if (env.VITE_STRIPE_LOOKUP_PRO_YEARLY?.trim()) {
    map.pro_monthly = { ...map.pro_monthly, year: env.VITE_STRIPE_LOOKUP_PRO_YEARLY }
  }
  if (env.VITE_STRIPE_LOOKUP_LIFETIME?.trim()) {
    map.lifetime = { one_time: env.VITE_STRIPE_LOOKUP_LIFETIME }
  }
  return map
}

/**
 * 汇总映射里所有 lookup_key，去重保序、空值不入列。
 *
 * 这是向 Stripe 批量取价（`lookup_keys[]`）的入参，也是「配没配价」的唯一判据。
 */
export function collectLookupKeys(map: LookupKeyMap): string[] {
  const keys = Object.values(map).flatMap((periods) => Object.values(periods ?? {}))
  return [...new Set(keys.filter((key): key is string => Boolean(key?.trim())))]
}

/** plan id + 计费周期 → lookup_key；任一缺失返回 `undefined`。 */
export function resolveLookupKey(
  map: LookupKeyMap,
  planId: string,
  interval?: string,
): string | undefined {
  const periods = map[planId]
  if (!periods) return undefined
  return periods[interval as PricingInterval]
}

/** lookup_key → plan id；未匹配返回 `undefined`（Price 可能是后台手工创建的）。 */
export function findPlanIdByLookupKey(map: LookupKeyMap, lookupKey: string): string | undefined {
  for (const [planId, periods] of Object.entries(map)) {
    if (Object.values(periods ?? {}).includes(lookupKey)) return planId
  }
  return undefined
}

/**
 * plan 在定价页是否可购买。
 *
 * 未配置 lookup key 时按钮降级为「先注册」，避免给用户一个点了就 502 的按钮。
 */
export function isPlanPurchasable(planId: string, map: LookupKeyMap): boolean {
  const periods = map[planId]
  if (!periods) return false
  return Object.values(periods).some((key) => Boolean(key?.trim()))
}

/**
 * 定价页方案与 lookup 映射的一致性自检，返回页面上找不到的 plan id。
 *
 * key 配了但页面没有对应方案时，用户永远买不到，配置却显示「完整」。
 */
export function findOrphanPlanIds(map: LookupKeyMap): string[] {
  const known = new Set(getPricingPlans().map((plan) => plan.id))
  return Object.keys(map).filter((planId) => !known.has(planId))
}

/**
 * 该 plan 实际可购买的计费周期，顺序固定为 `month` → `year` → `one_time`。
 *
 * 周期切换器、`startCheckout()` 的默认周期都从这一个函数取；各处自行读 `prices[0]`
 * 会不一致（症状：年付配好了却永远只提交月付）。
 * 只返回有非空 key 的周期，避免切换器出现点了就 502 的选项。
 */
export function availableIntervals(map: LookupKeyMap, planId: string): PricingInterval[] {
  const periods = map[planId]
  if (!periods) return []
  const order: PricingInterval[] = ['month', 'year', 'one_time']
  return order.filter((interval) => Boolean(periods[interval]?.trim()))
}
