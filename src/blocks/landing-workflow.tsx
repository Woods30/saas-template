import { IconCloudUpload, IconCode, IconPlugConnected } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { m } from '@/locale/paraglide/messages.js'

const workflowPreviews = [
  ['Cloudflare Workers', 'D1 / R2 / KV', '.env → service credentials'],
  ['src/routes/', 'src/config/website.ts', 'messages/zh.json · messages/en.json'],
  ['pnpm check', 'pnpm test', 'pnpm build', 'pnpm deploy'],
] as const

/** 首页「三步落地」工作流区块。 */
export function LandingWorkflow() {
  const [selected, setSelected] = useState(0)
  const id = useId()
  const steps = [
    {
      title: m.home_workflow_resources_title(),
      description: m.home_workflow_resources_description(),
      Icon: IconPlugConnected,
    },
    {
      title: m.home_workflow_business_title(),
      description: m.home_workflow_business_description(),
      Icon: IconCode,
    },
    {
      title: m.home_workflow_deploy_title(),
      description: m.home_workflow_deploy_description(),
      Icon: IconCloudUpload,
    },
  ]
  return (
    <section id="workflow" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-16 md:py-24">
      <p className="mb-4 text-xs font-semibold tracking-widest text-primary">
        {m.home_workflow_eyebrow()}
      </p>
      <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        {m.home_workflow_title()}
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        {m.home_workflow_description()}
      </p>
      <div className="lab-workflow mt-10">
        <ol className="grid gap-3">
          {steps.map(({ title, description, Icon }, index) => (
            <li key={title}>
              <button
                id={`${id}-step-${index}`}
                type="button"
                className="lab-step w-full text-left"
                aria-pressed={selected === index}
                aria-controls={`${id}-preview`}
                onClick={() => setSelected(index)}
              >
                <span className="flex items-center gap-4">
                  <span className="font-mono text-xs text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 text-base font-semibold">{title}</span>
                  <Icon size={20} aria-hidden />
                </span>
                <span className="mt-3 block text-sm leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <section
          id={`${id}-preview`}
          aria-labelledby={`${id}-step-${selected}`}
          className="lab-terminal"
          data-ambient
        >
          <div className="lab-terminal-rule flex items-center justify-between gap-3 border-b px-5 py-4 text-xs">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2 rounded-full bg-highlight" />
              <span className="lab-terminal-dot size-2 rounded-full" />
              <span className="lab-terminal-faint size-2 rounded-full" />
            </span>
            <span>{m.home_workflow_preview()}</span>
          </div>
          <div className="p-6 sm:p-8">
            <p className="lab-terminal-muted mb-6 text-xs">{m.home_demo_label()}</p>
            <div key={selected} className="space-y-4 font-mono text-sm">
              {workflowPreviews[selected]?.map((line, index) => (
                <p
                  key={line}
                  className="lab-terminal-line flex gap-3"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <span className="lab-terminal-faint" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <code className="break-words">{line}</code>
                </p>
              ))}
            </div>
            <div className="lab-signal-line my-8" aria-hidden />
            <p className="lab-terminal-muted text-sm leading-relaxed">
              {
                [
                  m.home_workflow_resources_note(),
                  m.home_workflow_business_note(),
                  m.home_workflow_deploy_note(),
                ][selected]
              }
            </p>
          </div>
        </section>
      </div>
    </section>
  )
}
