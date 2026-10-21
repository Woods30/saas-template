import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export interface PricingPlan {
  id: string
  name: string
  description?: string
  /** 月付/年付/一次性价格，`amount` 以分为单位；空数组表示 free 方案。 */
  prices: Array<{
    amount: number
    currency: string
    interval?: 'month' | 'year' | 'one_time'
    label?: string
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
  /** 当前计费周期；不传时退回 `prices[0]`，单周期 plan 无需额外传参。 */
  selectedInterval?: 'month' | 'year' | 'one_time'
}

/**
 * 定价卡片列表。一个 plan 配多个周期时只显示选中的那个，避免被误读成要付两份钱。
 * 渲染的是展示价（`pricingPlans` 里的静态金额），与 Stripe 实际售价需人工保持一致。
 */
export function Pricing({ title, subtitle, plans, renderCta, selectedInterval }: PricingProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices.find((p) => p.interval === selectedInterval) ?? plan.prices[0]
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-lg border p-6 ${
                plan.highlighted
                  ? 'border-primary shadow-lg ring-2 ring-primary/20'
                  : 'border-border'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}
              <div className="mt-4 space-y-1">
                {price && (
                  <p className="text-2xl font-bold">
                    {(price.amount / 100).toLocaleString('en-US', {
                      style: 'currency',
                      currency: price.currency.toUpperCase(),
                    })}
                    {price.interval && price.interval !== 'one_time' && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        /{price.interval === 'month' ? 'mo' : 'yr'}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.features.map((f, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
                  <li key={i} className="flex gap-2">
                    <span aria-hidden>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {renderCta ? (
                  renderCta(plan)
                ) : (
                  <Link
                    to={plan.cta.href}
                    className="rounded bg-primary px-4 py-2 text-center text-primary-foreground"
                  >
                    {plan.cta.label}
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
