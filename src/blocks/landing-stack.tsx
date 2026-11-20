import { IconBraces, IconCheck, IconCloudUpload, IconCode } from '@tabler/icons-react'
import { m } from '@/locale/paraglide/messages.js'

/** 首页「技术栈与工具箱」区块。 */
export function LandingStack() {
  const cards = [
    {
      title: m.home_stack_app_title(),
      description: m.home_stack_app_description(),
      stack: 'TanStack Start / Router / Query · TypeScript',
      Icon: IconCode,
    },
    {
      title: m.home_stack_cloud_title(),
      description: m.home_stack_cloud_description(),
      stack: 'Workers / D1 / R2 / KV · Drizzle',
      Icon: IconCloudUpload,
    },
    {
      title: m.home_stack_ui_title(),
      description: m.home_stack_ui_description(),
      stack: 'Tailwind CSS v4 / shadcn/ui / Base UI / Tabler',
      Icon: IconBraces,
    },
  ]
  const tools = [
    { label: m.home_toolkit_ui(), detail: m.home_toolkit_ui_items() },
    { label: m.home_toolkit_blocks(), detail: m.home_toolkit_blocks_items() },
    { label: m.home_toolkit_checks(), detail: m.home_toolkit_checks_items() },
  ]
  return (
    <section id="stack" className="lab-reveal mx-auto max-w-6xl px-6 py-16 md:py-24">
      <p className="text-xs font-semibold tracking-widest text-primary">{m.home_stack_eyebrow()}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
        {m.home_stack_title()}
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        {m.home_stack_description()}
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {cards.map(({ title, description, stack, Icon }) => (
          <article
            key={title}
            className="lab-feature-card flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6"
          >
            <Icon size={24} className="mb-5 text-primary" aria-hidden />
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
            <p className="mt-auto pt-6 font-mono text-xs leading-relaxed text-primary">{stack}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-6 md:p-8">
        <h3 className="text-lg font-semibold">{m.home_toolkit_title()}</h3>
        <dl className="mt-6 grid gap-6 md:grid-cols-3">
          {tools.map(({ label, detail }) => (
            <div key={label}>
              <dt className="flex items-center gap-2 text-sm font-medium">
                <IconCheck size={16} className="text-primary" aria-hidden />
                {label}
              </dt>
              <dd className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
