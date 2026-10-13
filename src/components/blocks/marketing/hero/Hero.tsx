import { Link } from '@tanstack/react-router'
import type { HeroProps } from './types'

export function Hero(props: HeroProps) {
  const align = props.align ?? 'left'
  return (
    <section className={`mx-auto max-w-5xl px-6 py-20 ${align === 'center' ? 'text-center' : ''}`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{props.title}</h1>
      {props.subtitle && <p className="mt-4 text-lg text-muted-foreground">{props.subtitle}</p>}
      {props.description && (
        <p className="mt-2 text-base text-muted-foreground">{props.description}</p>
      )}
      {(props.primaryCta || props.secondaryCta) && (
        <div className={`mt-8 flex gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
          {props.primaryCta && (
            <Link
              to={props.primaryCta.href}
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
            >
              {props.primaryCta.label}
            </Link>
          )}
          {props.secondaryCta && (
            <Link
              to={props.secondaryCta.href}
              className="rounded border border-border px-4 py-2 text-foreground"
            >
              {props.secondaryCta.label}
            </Link>
          )}
        </div>
      )}
      {props.image && (
        <img
          src={props.image.src}
          alt={props.image.alt}
          className="mt-10 rounded-lg border shadow-sm"
        />
      )}
    </section>
  )
}
