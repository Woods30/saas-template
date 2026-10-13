import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { CtaProps } from './types'

export function Cta({ title, description, primaryCta, secondaryCta }: CtaProps) {
  return (
    <section className="bg-primary px-6 py-16 text-primary-foreground">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        {description && <p className="mt-2 opacity-90">{description}</p>}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary">
            <Link to={primaryCta.href}>{primaryCta.label}</Link>
          </Button>
          {secondaryCta && (
            <Button
              asChild
              variant="outline"
              className="border-primary-foreground text-primary-foreground"
            >
              <Link to={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
