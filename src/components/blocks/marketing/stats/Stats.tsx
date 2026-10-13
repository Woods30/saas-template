import type { StatsProps } from './types'

export function Stats({ items }: StatsProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
        {items.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
          <div key={i}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
