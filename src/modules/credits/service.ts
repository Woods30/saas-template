/**
 * 积分模块的公开入口。
 *
 * 三块内容：
 * - `operations`：账本的发放 / 消费 / 退款 / 过期（写）；
 * - `ledger`：批次分配与过期判定（纯逻辑，单测直接覆盖）；
 * - `admin`：管理台视图（余额列表、流水列表、手工调整）。
 *
 * 跨模块只能从这里取东西——别的模块 import `@/modules/credits/service`，
 * 不能直接摸 `operations.ts` 或 `admin.ts`。
 */
export {
  type AdminCreditBalance,
  type AdminCreditBalancesQuery,
  type AdminCreditBalancesResult,
  type AdminCreditTransactionRow,
  type AdminCreditTransactionsQuery,
  type AdminCreditTransactionsResult,
  deductAdminCredits,
  fetchAdminCredits,
  fetchAdminCreditTransactions,
  grantAdminCredits,
  queryAdminCreditBalances,
  queryAdminCreditTransactions,
} from './admin'
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
