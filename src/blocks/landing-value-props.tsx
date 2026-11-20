import { m } from '@/locale/paraglide/messages.js'

/** 首屏下方的三条价值主张。 */
export function LandingValueProps() {
  const items = [
    { title: m.home_value_practices_title(), description: m.home_value_practices_description() },
    { title: m.home_value_start_title(), description: m.home_value_start_description() },
    { title: m.home_value_source_title(), description: m.home_value_source_description() },
  ]
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-14 md:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        </article>
      ))}
    </section>
  )
}
