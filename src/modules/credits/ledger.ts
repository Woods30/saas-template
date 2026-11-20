/**
 * 积分账本的纯逻辑：批次分配与过期判定。
 *
 * 这里不碰数据库——「先扣哪个批次」这件事必须能脱离 IO 单测，因为它决定了
 * 「快过期的积分先用掉」这条业务规则是否成立。
 */

/** 一个发放批次（桶）。 */
export interface CreditBucket {
  id: string
  /** 还没被消费掉的余额。 */
  remaining: number
  /** 到期时间；null 表示永不过期。 */
  expiresAt: Date | null
}

/** 从某个批次扣多少。 */
export interface Allocation {
  grantId: string
  amount: number
}

/**
 * 批次的消费顺序：先到期的先扣；永不过期的排最后；同到期按 id 稳定排序。
 *
 * 稳定排序是必要的：同一批次的先后顺序不能随查询返回顺序变化，否则同一次
 * 消费在不同请求里会扣到不同批次上，退款就再也对不上账。
 */
export function sortBuckets(buckets: readonly CreditBucket[]): CreditBucket[] {
  return [...buckets].sort((a, b) => {
    const at = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY
    const bt = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY
    if (at !== bt) return at - bt
    return a.id.localeCompare(b.id)
  })
}

/**
 * 按顺序分配消费额度。
 *
 * 返回的合计可能小于请求量——额度不够时由调用方判断是「扣全部」还是「报错」。
 */
export function planAllocation(buckets: readonly CreditBucket[], amount: number): Allocation[] {
  if (amount <= 0) return []
  const allocations: Allocation[] = []
  let remaining = amount
  for (const bucket of sortBuckets(buckets)) {
    if (remaining <= 0) break
    if (bucket.remaining <= 0) continue
    const take = Math.min(bucket.remaining, remaining)
    allocations.push({ grantId: bucket.id, amount: take })
    remaining -= take
  }
  return allocations
}

/** 可用额度合计：不含已过期与已用完的批次。 */
export function availableAmount(buckets: readonly CreditBucket[], now: Date): number {
  return buckets
    .filter(
      (bucket) =>
        bucket.remaining > 0 &&
        (bucket.expiresAt === null || bucket.expiresAt.getTime() > now.getTime()),
    )
    .reduce((sum, bucket) => sum + bucket.remaining, 0)
}

/** 已过期但还没作废的批次：过期后余额要扣掉，积分不能凭空消失。 */
export function planExpiry(buckets: readonly CreditBucket[], now: Date): Allocation[] {
  return buckets
    .filter(
      (bucket) =>
        bucket.remaining > 0 &&
        bucket.expiresAt !== null &&
        bucket.expiresAt.getTime() <= now.getTime(),
    )
    .map((bucket) => ({ grantId: bucket.id, amount: bucket.remaining }))
}
