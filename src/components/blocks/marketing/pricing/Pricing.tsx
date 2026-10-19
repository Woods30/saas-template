import { Link } from '@tanstack/react-router'
import type { PricingProps } from './types'

/**
 * 定价卡片列表。
 *
 * `selectedInterval` 决定显示哪个周期的价格。一个 plan 配了月付与年付两个 Price 时，
 * 两行同时渲染会让用户以为要付两份钱；这里由调用方（定价页的周期切换器）指定显示
 * 哪一个，未指定时退回列表第一个。
 *
 * 渲染的是**展示价**（`pricingPlans` 里的静态金额），不是 Stripe 上的实际售价——
 * 两者必须由人保持一致，组件无从校验。
 */
export function Pricing({ title, subtitle, plans, renderCta, selectedInterval }: PricingProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          // 一次性方案没有周期可切，永远显示它自己那一行。
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
