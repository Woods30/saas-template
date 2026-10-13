import type { FeaturesProps } from './types'

export function Features({ title, subtitle, columns = 3, items }: FeaturesProps) {
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[columns]
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <div className={`mt-10 grid gap-6 ${colClass}`}>
        {items.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
          <div key={i} className="rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
