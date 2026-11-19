/**
 * 核销型支付的领域类型与错误码。
 *
 * 配置层的形状（标价、收款账户）在 `@/types/manual-payments`：那一层要被
 * `src/config/*` 消费，放在模块内部会让配置反向依赖业务模块。这里只放**领域**
 * 概念——订单、状态机、核验动作与稳定错误码。
 */

import type { ManualPaymentChannel, ManualPaymentPrice } from '@/types/manual-payments'

export type {
  ManualPaymentAccountConfig,
  ManualPaymentChannel,
  ManualPaymentPrice,
} from '@/types/manual-payments'

/** 解析后的收款账户：源码配置兜底 + 数据库同 ID 覆盖的结果。 */
export interface ResolvedManualPaymentAccount {
  id: string
  channel: ManualPaymentChannel
  displayName: string
  currency: 'cny'
  /** 配置里的二维码地址；数据库只存 R2 key，所以这里来自配置。 */
  qrImageUrl: string | null
  /** 管理员上传到 R2 的二维码 key；有值时优先于配置 URL。 */
  qrImageKey: string | null
}

/** 核销订单的状态机。 */
export type ManualPaymentOrderStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'settling'
  | 'settled'
  | 'expired'
  | 'canceled'
  | 'rejected'
  | 'requires_refund'

/** 一笔核销订单的领域视图。 */
export interface ManualPaymentOrder {
  id: string
  userId: string
  accountId: string
  channel: ManualPaymentChannel
  qrImageUrl: string | null
  qrImageKey: string | null
  productId: string
  offerId: string
  kind: ManualPaymentPrice['kind']
  interval: 'month' | 'year' | null
  intervalCount: number | null
  /** 标价（分）。 */
  baseAmount: number
  /** 尾数，1–99。 */
  fingerprint: number
  /** 应付金额 = 标价 + 尾数（分）。 */
  payableAmount: number
  currency: 'cny'
  status: ManualPaymentOrderStatus
  payerNote: string | null
  receiptKey: string | null
  submittedAt: Date | null
  observedAmount: number | null
  externalReference: string | null
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  /** 到期时间 = 创建时间 + 15 分钟。 */
  expiresAt: Date
  settledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 领域层的稳定错误码。
 *
 * server 层按它映射 HTTP 状态与对外文案，领域层只负责把原因说清楚。
 */
export type ManualPaymentErrorCode =
  | 'MODULE_DISABLED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_OFFER'
  | 'NO_MANUAL_PAYMENT_ACCOUNT'
  | 'AMOUNT_POOL_EXHAUSTED'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_EXPIRED'
  | 'INVALID_ORDER_STATE'
  | 'INVALID_PAYER_NOTE'
  | 'INVALID_REVIEW_NOTE'
  | 'AMOUNT_MISMATCH'
  | 'SUBSCRIPTION_SLOT_TAKEN'
  | 'SETTLEMENT_IN_PROGRESS'
  | 'STORAGE_UNAVAILABLE'
  | 'INVALID_RECEIPT'

/** 带稳定错误码的领域异常。 */
export class ManualPaymentError extends Error {
  readonly code: ManualPaymentErrorCode

  constructor(code: ManualPaymentErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ManualPaymentError'
    this.code = code
  }
}

/** 用户辅助说明的最大字符数。 */
export const MANUAL_PAYMENT_PAYER_NOTE_MAX_LENGTH = 500

/** 申报付款的输入。 */
export interface SubmitOrderInput {
  /** 下单账号；必须与订单所有者一致，否则按订单不存在处理。 */
  userId: string
  orderId: string
  /** 用户填写的辅助说明，最多 500 字符。 */
  payerNote?: string | null
}

/** 取消订单的输入。 */
export interface CancelOrderInput {
  userId: string
  orderId: string
}

/** 用户订单列表的输入。 */
export interface ListUserOrdersInput {
  userId: string
  /** 单页条数，默认 20，上限 100。 */
  limit?: number
  /** 偏移量，默认 0。 */
  offset?: number
}

/** 用户订单列表的一页。 */
export interface UserOrderPage {
  rows: ManualPaymentOrder[]
  /** 该用户的订单总数（不受分页影响）。 */
  total: number
}

/**
 * 单个订单详情。
 *
 * `canUpload` 由服务端判定：对象存储绑定（`env.BUCKET`）只在服务端可见，
 * 页面不能自己读服务端上下文 —— 客户端静态导入服务端模块会把
 * `node:async_hooks` 打进浏览器 bundle，整站水合失败。
 */
export interface ManualPaymentOrderDetail {
  order: ManualPaymentOrder
  /** 是否可以上传付款凭证（没有 R2 绑定时为 false，但说明仍可填写）。 */
  canUpload: boolean
}

/**
 * 管理员的核验动作。
 *
 * - `approve`：普通通过，实际到账金额必须等于应付金额；
 * - `approve_exception`：异常通过，用于过期到账或金额不符，必须写理由；
 * - `reject`：驳回，不产生任何资金事实。
 */
export type ManualPaymentReviewAction = 'approve' | 'approve_exception' | 'reject'

/** 核验输入。 */
export interface ReviewOrderInput {
  /** 待核验的订单 ID。 */
  orderId: string
  /** 核验管理员的用户 ID。 */
  reviewerId: string
  /** 核验动作。 */
  action: ManualPaymentReviewAction
  /** 管理员在真实流水里看到的到账金额（分）。普通核验必须等于应付金额。 */
  observedAmount?: number | null
  /** 核验备注；异常核验必须填写。 */
  reviewNote?: string | null
  /** 运营填写的外部流水号。 */
  externalReference?: string | null
}

/** 规范化后的核验结果。 */
export interface ManualPaymentReview {
  action: ManualPaymentReviewAction
  /** 实际到账金额（分）。 */
  observedAmount: number | null
  reviewNote: string | null
  externalReference: string | null
  reviewedBy: string
  /**
   * 核验时刻。
   *
   * 订阅周期与结算事件都以它为基准，重试时沿用同一个值 —— 否则崩溃重试会把
   * 周期再往后推一次。
   */
  reviewedAt: Date
}
