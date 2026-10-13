import type { FaqProps } from './types'

export function Faq({ title, items }: FaqProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      <div className="mt-8 space-y-4">
        {items.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
          <details key={i} className="rounded border border-border p-4 open:bg-muted/50">
            <summary className="cursor-pointer font-medium">{f.question}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
