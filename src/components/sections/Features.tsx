import type { ReactNode } from 'react'

export interface FeatureItem {
  icon?: ReactNode
  title: string
  description: string
  detail?: string
  visual?: ReactNode
  wide?: boolean
}
export interface FeaturesProps {
  title?: string
  subtitle?: string
  eyebrow?: string
  variant?: 'default' | 'bento'
  columns?: 2 | 3 | 4
  items: FeatureItem[]
}

export function Features({
  title,
  subtitle,
  eyebrow,
  variant = 'default',
  columns = 3,
  items,
}: FeaturesProps) {
  const bento = variant === 'bento'
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[columns]
  return (
    <section
      className={bento ? 'mx-auto max-w-6xl px-6 py-16 md:py-24' : 'mx-auto max-w-5xl px-6 py-16'}
    >
      {eyebrow && (
        <p className="mb-4 text-xs font-semibold tracking-widest text-primary">{eyebrow}</p>
      )}
      {title && (
        <h2
          className={
            bento
              ? 'max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl'
              : 'text-center text-3xl font-bold'
          }
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          className={
            bento
              ? 'mt-4 max-w-2xl leading-relaxed text-muted-foreground'
              : 'mt-2 text-center text-muted-foreground'
          }
        >
          {subtitle}
        </p>
      )}
      <div
        className={`mt-10 grid ${bento ? 'gap-4 md:grid-cols-2 lg:grid-cols-4' : `gap-6 ${colClass}`}`}
      >
        {items.map((f) => (
          <article
            key={f.title}
            className={
              bento
                ? `lab-feature-card flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6 md:p-7 ${f.wide ? 'md:col-span-2' : ''}`
                : 'rounded-lg border border-border p-6'
            }
          >
            {f.icon && (
              <div
                aria-hidden="true"
                className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary"
              >
                {f.icon}
              </div>
            )}
            <h3 className="text-lg font-semibold leading-snug">{f.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            {f.visual}
            {f.detail && (
              <p className="mt-auto break-words pt-6 font-mono text-xs leading-relaxed text-muted-foreground">
                {f.detail}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
