/** 尚未终止的订阅均占账号名额，包括待支付和已安排期末取消的订阅。 */
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
] as const

export function occupiesSubscriptionSlot(status: string): boolean {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
}
