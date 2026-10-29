export type PricingInterval = 'month' | 'year' | 'week' | 'day' | 'one_time'

/** 名称与卖点在请求语言确定后求值，销售引用由当前 provider 解释。 */
export interface ProductDefinition {
  id: string
  name: string
  description?: string
  features: string[]
  recommended?: boolean
  prices: Record<string, string>
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
