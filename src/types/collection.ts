/**
 * 核销型支付（collection）的共享类型。
 *
 * 这条链路不接支付渠道：用户按订单金额向收款码付款，管理员核验后结算。
 * 金额一律以「分」为单位的整数保存，币种首期固定人民币。
 *
 * 类型放在 `src/types` 而不是模块内部，是因为**配置层与业务层都要用**：
 * `src/config/website.ts` 声明收款账户，`src/config/products.ts` 声明核销型标价，
 * `src/modules/manual-payments` 消费它们。放模块内部会让配置层反向依赖业务模块。
 */

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
