import { pricingPlans } from '@/config/blocks'

/**
 * 定价方案 ↔ Stripe Price ID 的显式映射。
 *
 * 为什么用显式映射而不是「plan id 拼 price id」：
 * - Stripe 的 Price ID 是外部系统的主键，格式与本站 plan id 无关；
 * - 同一个 plan（如 `pro`）可能有月付 / 年付两个 Price，只靠 id 拼不出选中的那个；
 * - 缺失映射时必须**明确失败**：静默回退到另一个 Price 会让用户按错误价位付款。
 *
 * `mode` 与 `interval` 必须自洽：`subscription` 配 `one_time`（或反之）会在
 * Stripe 侧直接报错，而报错信息只出现在日志里，用户侧只是一次 502。
 */

/** plan id →（计费周期 → Stripe Price ID）。 */
export type PriceMap = Record<string, Partial<Record<'month' | 'year' | 'one_time', string>>>

/**
 * 从公开 env 派生 Price 映射。
 *
 * 只放行**至少有一个非空 Price** 的 plan：`pro_monthly` 只配了月付时，
 * 不允许用户选到没有 Price 的年付周期。
 * 未配置任何 Price ID 时返回空映射——此时 `allowedPriceIds` 也为空，结账入口
 * 由 `payment.enabled` 与配置诊断一并挡下，不会出现「能点但 502」。
 */
export function buildPriceMap(env: {
  VITE_STRIPE_PRICE_PRO_MONTHLY?: string
  VITE_STRIPE_PRICE_PRO_YEARLY?: string
  VITE_STRIPE_PRICE_LIFETIME?: string
}): PriceMap {
  const map: PriceMap = {}
  // 显式逐个赋值而不是抽一个内部 helper：`tsx` 对嵌套箭头函数会注入 `__name`
  // 辅助调用，而该 helper 在部分运行方式下未定义（`TypeError: __name is not a
  // function`），导致 `scripts/check-env.ts` 这类直接跑 TS 的入口在模块加载期就崩。
  // 保持模块顶层函数扁平，让脚本与构建产物走同一条路径。
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
 * 把价格映射汇总成 `/api/payment` 的 Price 白名单。
 *
 * 与 `priceMap` 由同一份 env 派生，见 `src/config/website.ts` 的说明：白名单与取价
 * 依据分家是「点了 502」的典型成因。去重保序，空值不入列。
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
 * 三个条件同时成立才可点：页面上有 CTA、映射里有 Price、且该 Price 非空。
 * 这样模板在**未配置 Price ID** 时，定价页依然完整可看，只是付费方案按钮降级为
 * 「先注册」——不会给用户一个点了就 502 的按钮。
 */
export function isPlanPurchasable(planId: string, priceMap: PriceMap): boolean {
  const periods = priceMap[planId]
  if (!periods) return false
  return Object.values(periods).some((id) => Boolean(id?.trim()))
}

/**
 * 定价页方案与 Price 映射的**一致性自检**。
 *
 * 映射里的 plan id 必须都能在定价页找到：否则 Price 配了但页面上没有对应方案，
 * 用户永远买不到，配置却显示「完整」。返回找不到的 plan id 列表。
 */
export function findOrphanPlanIds(priceMap: PriceMap): string[] {
  const known = new Set(pricingPlans.map((plan) => plan.id))
  return Object.keys(priceMap).filter((planId) => !known.has(planId))
}
