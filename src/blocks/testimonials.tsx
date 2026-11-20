export interface Testimonial {
  quote: string
  author: string
  role?: string
  avatar?: string
}
export interface TestimonialsProps {
  title?: string
  items: Testimonial[]
}

export function Testimonials({ title, items }: TestimonialsProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {items.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
          <figure key={i} className="rounded-lg border border-border p-6">
            <blockquote className="text-sm">"{t.quote}"</blockquote>
            <figcaption className="mt-4 text-sm font-medium">
              {t.author}
              {t.role && <span className="text-muted-foreground"> · {t.role}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
