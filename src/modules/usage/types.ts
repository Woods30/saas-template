/**
 * 用量：计量与流水。
 *
 * 「用量」记的是**发生了什么**（调用了几次 API、跑了多少 token），
 * 「积分」记的是**扣了多少**——两者分开，用量可以事后统计，积分是余额。
 *
 * 计量入口 `meterUsage` 把三件事串起来：查额度 → 扣额度 → 扣积分 → 记流水。
 * 顺序不能反：先扣积分再扣额度，额度不足时积分已经扣了却要退；先扣额度再扣积分，
 * 积分不足时额度已经扣了，退额度只是一条条件更新，比退积分便宜得多。
 */

/** 一条用量流水。 */
export interface UsageRecord {
  id: string
  userId: string
  /** 计量项：`api_call` / `image` / `token`… */
  metric: string
  quantity: number
  unit: string
  /** 本次消耗的积分。 */
  credits: number
  requestId: string | null
  idempotencyKey: string | null
  /** 附加信息。 */
  metadata: Record<string, unknown> | null
  createdAt: Date
}

/** 按计量项汇总。 */
export interface UsageSummary {
  metric: string
  /** 合计数量。 */
  quantity: number
  /** 合计积分。 */
  credits: number
  /** 计量次数。 */
  records: number
}
