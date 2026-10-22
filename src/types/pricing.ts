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
  /** 展示价。**金额来自 Stripe**，不是写死的文案常量。 */
  prices: PricingPrice[]
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
}

/**
 * 定价方案定义：只描述「这个方案叫什么、有什么卖点、点了去哪」。
 *
 * 金额与「有哪些计费周期」都不在这里——前者由 Stripe 的 Price 决定，后者由
 * `lookup_key` 映射决定（见 `src/payment/price-catalog.ts`）。写死金额的病根是
 * 「页面显示」与「实际扣款」分属两份数据，改价必然漂移。
 */
export interface PricingPlanDefinition {
  id: string
  name: string
  description?: string
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
}
