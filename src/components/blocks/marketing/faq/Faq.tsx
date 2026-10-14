import { IconPlus } from '@tabler/icons-react'
import type { FaqProps } from './types'

export function Faq({ title, eyebrow, variant = 'default', items }: FaqProps) {
  const split = variant === 'split'
  return (
    <section
      className={
        split
          ? 'mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[1fr_1.5fr] md:gap-16 md:py-24'
          : 'mx-auto max-w-3xl px-6 py-16'
      }
    >
      <div>
        {eyebrow && (
          <p className="mb-4 text-xs font-semibold tracking-widest text-primary">{eyebrow}</p>
        )}
        {title && (
          <h2
            className={
              split
                ? 'text-3xl font-semibold leading-tight tracking-tight md:text-4xl'
                : 'text-center text-3xl font-bold'
            }
          >
            {title}
          </h2>
        )}
      </div>
      <div
        className={
          split ? 'min-w-0 divide-y divide-border border-y border-border' : 'mt-8 space-y-4'
        }
      >
        {items.map((f) => (
          <details
            key={f.question}
            className={
              split ? 'group py-5' : 'group rounded border border-border p-4 open:bg-muted/50'
            }
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {f.question}
              <IconPlus
                size={18}
                aria-hidden="true"
                className="shrink-0 text-muted-foreground group-open:rotate-45"
              />
            </summary>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
