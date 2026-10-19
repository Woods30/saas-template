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
  /**
   * 当前选中的计费周期，决定每个 plan 显示哪一行价格。
   *
   * 不传时退回 `prices[0]`：一个 plan 只配一个周期（模板默认状态）时行为不变，
   * 不需要调用方额外传参。
   */
  selectedInterval?: 'month' | 'year' | 'one_time'
}
