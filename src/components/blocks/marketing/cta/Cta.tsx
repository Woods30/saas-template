import { Link } from '@tanstack/react-router'
import type { CtaProps } from './types'

export function Cta({ title, description, primaryCta, secondaryCta }: CtaProps) {
  return (
    <section className="bg-primary px-6 py-16 text-primary-foreground">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        {description && <p className="mt-2 opacity-90">{description}</p>}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to={primaryCta.href}
            className="rounded bg-secondary px-4 py-2 text-secondary-foreground"
          >
            {primaryCta.label}
          </Link>
          {secondaryCta && (
            <Link
              to={secondaryCta.href}
              className="rounded border border-primary-foreground px-4 py-2 text-primary-foreground"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
