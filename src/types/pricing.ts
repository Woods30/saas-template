/** 计费周期。月付 / 年付按订阅，一次性为买断。 */
export type PricingInterval = 'month' | 'year' | 'one_time'

export interface PricingPrice {
  /** 展示价，以「分」为单位。 */
  amount: number
  currency: string
  interval?: PricingInterval
  label?: string
}

export interface PricingPlan {
  id: string
  name: string
  description?: string
  /** `prices` 只是**展示**数据，实际扣款价由 Stripe 的 Price ID 决定；空数组表示 free 方案。 */
  prices: PricingPrice[]
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
}
