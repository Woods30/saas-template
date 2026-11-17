/**
 * 权益（套餐功能与额度）的类型。
 *
 * 两类权益：
 * - `boolean`：开关型，「有没有这个功能」；
 * - `quota`：额度型，「能用多少次 / 多少量」。
 */

/** 权益类型。 */
export type EntitlementType = 'boolean' | 'quota'

/** 额度周期：`none`（永久）/ `month` / `year`。 */
export type EntitlementPeriod = 'none' | 'month' | 'year'

/** 权益目录里的一项。 */
export interface EntitlementCatalogItem {
  key: string
  name: string
  type: EntitlementType
  /** quota 类型的默认额度；null 表示不限量。boolean 类型忽略。 */
  defaultLimit: number | null
  period: EntitlementPeriod
  description: string | null
  sortOrder: number
}

/** 套餐。 */
export interface PlanItem {
  key: string
  name: string
  description: string | null
  productId: string | null
  offerId: string | null
  active: boolean
  sortOrder: number
}

/** 解析后的用户权益：目录 + 套餐 + 用户覆盖的合并结果。 */
export interface ResolvedEntitlement {
  key: string
  name: string
  type: EntitlementType
  /** 生效额度；null 表示不限量。 */
  limit: number | null
  /** 已用量。 */
  used: number
  /** 剩余额度；不限量时为 null。 */
  remaining: number | null
  enabled: boolean
  period: EntitlementPeriod
  periodStart: Date | null
  periodEnd: Date | null
}

/** 额度用尽。 */
export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED'

  constructor(
    readonly entitlementKey: string,
    readonly required: number,
    readonly limit: number,
    readonly used: number,
  ) {
    super(`权益 ${entitlementKey} 额度不足：需要 ${required}，额度 ${limit}，已用 ${used}`)
    this.name = 'QuotaExceededError'
  }
}

/** 权益不存在。 */
export class EntitlementNotFoundError extends Error {
  readonly code = 'ENTITLEMENT_NOT_FOUND'

  constructor(readonly entitlementKey: string) {
    super(`未知权益：${entitlementKey}`)
    this.name = 'EntitlementNotFoundError'
  }
}
