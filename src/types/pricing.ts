import type { CollectionPrice } from './collection'

export type PricingInterval = 'month' | 'year' | 'week' | 'day' | 'one_time'

/** 名称与卖点在请求语言确定后求值，销售引用由当前 provider 解释。 */
export interface ProductDefinition {
  id: string
  name: string
  description?: string
  features: string[]
  recommended?: boolean
  prices: Record<string, string>
  /**
   * 核销型链路的本地标价（单位：分）。
   *
   * 与 `prices` 互不影响：`prices` 是托管支付渠道的销售引用，金额由渠道的价格
   * 目录给出；核销型链路不接渠道，没有价格目录可用，金额只能在这里声明，
   * 且**只此一处**——展示与结算读同一份。
   */
  collectionPrices?: Record<string, CollectionPrice>
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
