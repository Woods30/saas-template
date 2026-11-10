/**
 * 核销型支付（collection）的配置类型。
 *
 * 这条链路不接支付渠道：用户按订单金额向收款码付款，管理员核验后结算。
 * 金额一律以「分」为单位的整数保存，币种首期固定人民币。
 */

/** 新订单走哪条结账链路。 */
export type CheckoutMode = 'provider' | 'collection'

/** 首期只支持支付宝个人收款码。 */
export type CollectionChannel = 'alipay'

/** 一个付费方式在核销链路下的标价。 */
export interface CollectionPrice {
  /** 金额，单位为分，必须是正整数。 */
  amount: number
  currency: 'cny'
  kind: 'subscription' | 'one_time'
  /** 订阅周期；一次性价格不得声明。 */
  interval?: 'month' | 'year'
  /** 周期数，必须是正整数；一次性价格不得声明。 */
  intervalCount?: number
}

/** 收款账户的兜底配置（数据库可按 ID 覆盖）。 */
export interface CollectionAccountConfig {
  /** 账户 ID：配置内唯一，数据库覆盖按它对应。 */
  id: string
  channel: CollectionChannel
  displayName: string
  currency: 'cny'
  /** 二维码地址：站内根路径或无凭据的 HTTPS URL。 */
  qrImageUrl: string
}

/** 解析后的收款账户：源码配置兜底 + 数据库同 ID 覆盖的结果。 */
export interface ResolvedCollectionAccount {
  id: string
  channel: CollectionChannel
  displayName: string
  currency: 'cny'
  /** 配置里的二维码地址；数据库只存 R2 key，所以这里来自配置。 */
  qrImageUrl: string | null
  /** 管理员上传到 R2 的二维码 key；有值时优先于配置 URL。 */
  qrImageKey: string | null
}

/** 核销订单的状态机（见设计说明第 6 节）。 */
export type CollectionOrderStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'settling'
  | 'settled'
  | 'expired'
  | 'canceled'
  | 'rejected'
  | 'requires_refund'

/** 一笔核销订单的领域视图。 */
export interface CollectionOrder {
  id: string
  userId: string
  accountId: string
  channel: CollectionChannel
  qrImageUrl: string | null
  qrImageKey: string | null
  productId: string
  offerId: string
  kind: CollectionPrice['kind']
  interval: 'month' | 'year' | null
  intervalCount: number | null
  /** 标价（分）。 */
  baseAmount: number
  /** 尾数，1–99。 */
  fingerprint: number
  /** 应付金额 = 标价 + 尾数（分）。 */
  payableAmount: number
  currency: 'cny'
  status: CollectionOrderStatus
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
export type CollectionErrorCode =
  | 'MODULE_DISABLED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_OFFER'
  | 'NO_COLLECTION_ACCOUNT'
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
export class CollectionError extends Error {
  readonly code: CollectionErrorCode

  constructor(code: CollectionErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'CollectionError'
    this.code = code
  }
}

/** 用户辅助说明的最大字符数。 */
export const COLLECTION_PAYER_NOTE_MAX_LENGTH = 500

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
  rows: CollectionOrder[]
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
export interface CollectionOrderDetail {
  order: CollectionOrder
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
export type CollectionReviewAction = 'approve' | 'approve_exception' | 'reject'

/** 核验输入。 */
export interface ReviewOrderInput {
  /** 待核验的订单 ID。 */
  orderId: string
  /** 核验管理员的用户 ID。 */
  reviewerId: string
  /** 核验动作。 */
  action: CollectionReviewAction
  /** 管理员在真实流水里看到的到账金额（分）。普通核验必须等于应付金额。 */
  observedAmount?: number | null
  /** 核验备注；异常核验必须填写。 */
  reviewNote?: string | null
  /** 运营填写的外部流水号。 */
  externalReference?: string | null
}

/** 规范化后的核验结果。 */
export interface CollectionReview {
  action: CollectionReviewAction
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
