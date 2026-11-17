/**
 * 积分模块的公开入口。
 *
 * 三块内容：
 * - `operations`：账本的发放 / 消费 / 退款 / 过期（写）；
 * - `ledger`：批次分配与过期判定（纯逻辑，单测直接覆盖）。
 *
 * 跨模块只能从这里取东西——别的模块 import `@/modules/credits/service`，
 * 不能直接摸 `operations.ts`。
 */
export {
  type Allocation,
  availableAmount,
  type CreditBucket,
  planAllocation,
  planExpiry,
  sortBuckets,
} from './ledger'
export {
  type ConsumeInput,
  type CreditBalance,
  consumeCredits,
  expireCredits,
  type GrantInput,
  getBalance,
  getBalanceSummary,
  grantCredits,
  InsufficientCreditsError,
  listTransactions,
  type RefundInput,
  refundCredits,
} from './operations'
export type {
  CreditResult,
  CreditSource,
  CreditTransaction,
  CreditTransactionType,
} from './types'
