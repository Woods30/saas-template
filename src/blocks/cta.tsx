import { IconArrowUpRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'

export interface CtaProps {
  title: string
  variant?: 'default' | 'quiet'
  description?: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}

export function Cta({
  title,
  description,
  primaryCta,
  secondaryCta,
  variant = 'default',
}: CtaProps) {
  const quiet = variant === 'quiet'
  return (
    <section
      className={
        quiet
          ? 'mx-auto max-w-6xl px-6 pb-20 pt-6'
          : 'bg-primary px-6 py-16 text-primary-foreground'
      }
    >
      <div
        className={
          quiet
            ? 'flex flex-col items-start gap-7 rounded-2xl border border-border bg-secondary/50 p-8 md:flex-row md:items-center md:justify-between md:p-10'
            : 'mx-auto max-w-3xl text-center'
        }
      >
        <div>
          <h2
            className={
              quiet
                ? 'max-w-xl text-2xl font-semibold tracking-tight md:text-3xl'
                : 'text-3xl font-bold'
            }
          >
            {title}
          </h2>
          {description && (
            <p
              className={
                quiet
                  ? 'mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground'
                  : 'mt-2 opacity-90'
              }
            >
              {description}
            </p>
          )}
        </div>
        <div
          className={
            quiet
              ? 'flex shrink-0 flex-wrap gap-3'
              : 'mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center'
          }
        >
          <Link
            to={primaryCta.href}
            className={
              quiet
                ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none'
                : 'rounded bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
            }
          >
            {primaryCta.label}
            {quiet && <IconArrowUpRight size={17} aria-hidden="true" />}
          </Link>
          {secondaryCta && (
            <Link
              to={secondaryCta.href}
              className="rounded border border-current px-4 py-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
