import type { CollectionPrice } from '@/collection/types'

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
   * 核销型（收款码）链路下的本地价格，金额单位是分。
   *
   * 与 `prices` 平行：前者是渠道销售引用，后者是本地金额事实源。只给真正要走
   * 收款码售出的付费方式配置，其余不写。
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
