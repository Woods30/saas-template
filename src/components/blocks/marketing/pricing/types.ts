import type { ReactNode } from 'react'

export interface PricingPlan {
  id: string
  name: string
  description?: string
  /** 月付/年付/一次性价格；空数组表示 free 方案 */
  prices: Array<{
    amount: number // 以分为单位
    currency: string
    interval?: 'month' | 'year' | 'one_time'
    label?: string // 例如 "月付"
  }>
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
}

export interface PricingProps {
  title?: string
  subtitle?: string
  plans: PricingPlan[]
  /** 渲染自定义 CTA（用于接 authClient + createCheckoutSession） */
  renderCta?: (plan: PricingPlan) => ReactNode
}
