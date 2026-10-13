import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { PricingProps } from './types'

export function Pricing({ title, subtitle, plans, renderCta }: PricingProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && (
        <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-lg border p-6 ${
              plan.highlighted ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border'
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
              {plan.prices.map((p, i) => (
                <p key={i} className="text-2xl font-bold">
                  {(p.amount / 100).toLocaleString('en-US', {
                    style: 'currency',
                    currency: p.currency.toUpperCase(),
                  })}
                  {p.interval && p.interval !== 'one_time' && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      /{p.interval === 'month' ? 'mo' : 'yr'}
                    </span>
                  )}
                </p>
              ))}
            </div>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {plan.features.map((f, i) => (
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
                <Button asChild className="w-full">
                  <Link to={plan.cta.href}>{plan.cta.label}</Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
