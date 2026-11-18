import { m } from '@/locale/paraglide/messages.js'

/** 技术栈横条。 */
export function LandingTechnologyStrip() {
  const technologies = [
    m.home_stack_start(),
    m.home_stack_typescript(),
    m.home_stack_workers(),
    m.home_stack_drizzle(),
    m.home_stack_stripe(),
    m.home_stack_tailwind(),
  ]
  return (
    <section aria-label={m.home_stack_label()} className="mx-auto max-w-6xl px-6">
      <div className="flex flex-col gap-5 border-y border-border py-6 md:flex-row md:items-center md:gap-8">
        <p className="shrink-0 text-xs text-muted-foreground">{m.home_stack_label()}</p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {technologies.map((technology) => (
            <li key={technology} className="font-mono text-xs font-medium">
              {technology}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
