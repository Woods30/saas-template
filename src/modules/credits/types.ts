/**
 * 积分账本的类型与错误。
 *
 * 单独一个文件，是因为 `service.ts`（唯一公开入口）之外，路由与后台页面
 * 只需要错误类型与结果形状，不需要碰账本内部。
 */

/** 发放来源。 */
export type CreditSource = 'purchase' | 'admin' | 'bonus' | 'refund' | 'adjust'

/** 流水类型。`amount` 的符号由类型决定：发放 / 退款为正，消费 / 过期为负。 */
export type CreditTransactionType = 'grant' | 'consume' | 'refund' | 'expire' | 'adjust'

/** 账本流水：只追加，是账本的事实源。 */
export interface CreditTransaction {
  id: string
  userId: string
  type: CreditTransactionType
  /** 有符号金额。 */
  amount: number
  /** 这笔之后的余额。 */
  balanceAfter: number
  /** 外部引用：订单号、支付流水号等。 */
  reference: string | null
  /** 附加信息（JSON 文本）：反扣记录应扣 / 实际扣减 / 差额。 */
  metadata: string | null
  /** 幂等键：同一个键重复提交只生效一次。 */
  idempotencyKey: string
  createdAt: Date
}

/** 一次账本操作的结果。 */
export interface CreditResult {
  transaction: CreditTransaction
  /**
   * true 表示这次调用没有产生新流水——是同一幂等键的重放。
   *
   * 调用方据此区分「我扣了钱」与「刚才已经扣过了」，前者要提示成功，
   * 后者不该再提示一次扣款。
   */
  replayed: boolean
}

/** 积分不够。带上需要的与可用的额度，调用方能直接给出可读提示。 */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS'

  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`积分不足：需要 ${required}，可用 ${available}`)
    this.name = 'InsufficientCreditsError'
  }
}
