import type { ManualPaymentPrice } from './manual-payments'

export type PricingInterval = 'month' | 'year' | 'week' | 'day' | 'one_time'

/**
 * 一次成功支付发放的积分。
 *
 * 数量与有效期写在与产品定义同源的地方（`src/config/products.ts`），
 * 支付事件只按商品与付费方式查表；有效期按**发放时刻**往后推。
 */
export interface OfferCreditGrant {
  amount: number
  /** 积分有效期（天）；不写则永不过期。 */
  durationDays?: number
}

/** 名称与卖点在请求语言确定后求值，销售引用由当前 provider 解释。 */
export interface ProductDefinition {
  id: string
  name: string
  description?: string
  features: string[]
  recommended?: boolean
  prices: Record<string, string>
  /**
   * 每种付费方式成功后发放的积分；键与 `prices` 一致。
   *
   * 订阅每次续费（每一期付款）都按同一份配置再发一次。
   */
  credits?: Record<string, OfferCreditGrant>
  /**
   * 核销型链路的本地标价（单位：分）。
   *
   * 与 `prices` 互不影响：`prices` 是托管支付渠道的销售引用，金额由渠道的价格
   * 目录给出；核销型链路不接渠道，没有价格目录可用，金额只能在这里声明，
   * 且**只此一处**——展示与结算读同一份。
   */
  manualPaymentPrices?: Record<string, ManualPaymentPrice>
}

export interface ProductPrice {
  id: string
  kind: 'subscription' | 'one_time'
  interval?: PricingInterval
  intervalCount?: number
  amount: number
  currency: string
  label: string
}

export interface PricingProduct extends ProductDefinition {
  options: ProductPrice[]
}
