import {
  IconArrowUpRight,
  IconBraces,
  IconBulb,
  IconCheck,
  IconCloudUpload,
  IconCode,
  IconCreditCard,
  IconDatabase,
  IconFile,
  IconMail,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnected,
  IconRocket,
  IconShieldLock,
} from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { type PointerEvent, useEffect, useId, useRef, useState } from 'react'
import { Cta, Faq, Features, Hero } from '@/components/blocks/marketing'
import { homeBlocks } from '@/config/blocks/home'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

const MAX_TILT_DEGREES = 4

function LeapJourney({ paused }: { paused: boolean }) {
  const [selected, setSelected] = useState(0)
  const id = useId()
  const steps = [
    {
      label: m.home_journey_idea(),
      title: m.home_journey_idea_title(),
      description: m.home_journey_idea_description(),
      Icon: IconBulb,
    },
    {
      label: m.home_journey_build(),
      title: m.home_journey_build_title(),
      description: m.home_journey_build_description(),
      Icon: IconCode,
    },
    {
      label: m.home_journey_launch(),
      title: m.home_journey_launch_title(),
      description: m.home_journey_launch_description(),
      Icon: IconRocket,
    },
  ] as const
  const active = steps[selected] ?? steps[0]

  function tilt(event: PointerEvent<HTMLElement>) {
    if (
      paused ||
      event.pointerType !== 'mouse' ||
      !window.matchMedia(
        '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
      ).matches
    )
      return
    const { currentTarget, clientX, clientY } = event
    const bounds = currentTarget.getBoundingClientRect()
    currentTarget.style.setProperty(
      '--tilt-x',
      `${((clientY - bounds.top) / bounds.height - 0.5) * -MAX_TILT_DEGREES}deg`,
    )
    currentTarget.style.setProperty(
      '--tilt-y',
      `${((clientX - bounds.left) / bounds.width - 0.5) * MAX_TILT_DEGREES}deg`,
    )
  }

  function resetTilt(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty('--tilt-x')
    event.currentTarget.style.removeProperty('--tilt-y')
  }

  return (
    <figure
      className="lab-stage lab-tilt min-w-0"
      data-ambient
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
    >
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-accent" />
        {m.home_visual_label()}
      </p>
      <div className="leap-scene" data-step={selected}>
        <svg className="leap-trail" viewBox="0 0 400 260" fill="none" aria-hidden="true">
          <path className="leap-trail-small" d="M 24 230 Q 70 128 128 183" />
          <path className="leap-trail-big" d="M 128 183 Q 215 -8 369 112" />
          <circle cx="24" cy="230" r="5" />
          <circle cx="128" cy="183" r="5" />
          <circle cx="369" cy="112" r="5" />
        </svg>
        <span className="leap-horizon" aria-hidden="true" />
        <img
          src="/mascot.png"
          alt={m.home_mascot_alt()}
          width={1032}
          height={714}
          className="leap-mascot"
          decoding="async"
        />
      </div>
      <ol className="leap-stops">
        {steps.map(({ label, Icon }, index) => (
          <li key={label}>
            <button
              id={`${id}-journey-${index}`}
              type="button"
              className="leap-stop"
              aria-pressed={selected === index}
              aria-controls={`${id}-detail`}
              onClick={() => setSelected(index)}
            >
              <span className="leap-stop-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span>
                <span className="font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>{' '}
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <section
        id={`${id}-detail`}
        aria-labelledby={`${id}-journey-${selected}`}
        className="mt-5 min-h-24 rounded-xl border border-border bg-background/70 p-4"
      >
        <p className="text-sm font-semibold">{active.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{active.description}</p>
      </section>
      <figcaption className="sr-only">{m.home_lab_hint()}</figcaption>
    </figure>
  )
}

function BrandStory() {
  const id = useId()
  return (
    <section
      id="story"
      aria-labelledby={id}
      className="leap-story lab-reveal mx-auto max-w-6xl px-6 py-16 md:py-24"
    >
      <div className="leap-story-manifesto">
        <p className="text-xs font-semibold tracking-widest text-primary">
          {m.home_story_eyebrow()}
        </p>
        <h2
          id={id}
          className="mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
        >
          {m.home_story_title()}
        </h2>
        <p className="mt-5 text-lg font-semibold text-primary" lang="en">
          {m.brand_slogan()}
        </p>
      </div>
      <div className="leap-story-copy">
        <p>{m.home_story_origin()}</p>
        <p>{m.home_story_makers()}</p>
      </div>
    </section>
  )
}

function StackAndToolkit() {
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

function TechnologyStrip() {
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

const workflowPreviews = [
  ['Cloudflare Workers', 'D1 / R2 / KV', '.env → service credentials'],
  ['src/routes/', 'src/config/website.ts', 'messages/zh.json · messages/en.json'],
  ['pnpm check', 'pnpm test', 'pnpm build', 'pnpm deploy'],
] as const

function Workflow() {
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
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-xs">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2 rounded-full bg-accent" />
              <span className="size-2 rounded-full bg-white/30" />
              <span className="size-2 rounded-full bg-white/20" />
            </span>
            <span>{m.home_workflow_preview()}</span>
          </div>
          <div className="p-6 sm:p-8">
            <p className="mb-6 text-xs text-white/60">{m.home_demo_label()}</p>
            <div key={selected} className="space-y-4 font-mono text-sm">
              {workflowPreviews[selected]?.map((line, index) => (
                <p
                  key={line}
                  className="lab-terminal-line flex gap-3"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <span className="text-white/35" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <code className="break-words">{line}</code>
                </p>
              ))}
            </div>
            <div className="lab-signal-line my-8" aria-hidden />
            <p className="text-sm leading-relaxed text-white/70">
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

function SourceOverview() {
  const items = [
    { title: m.home_source_code_title(), description: m.home_source_code_description() },
    { title: m.home_source_resources_title(), description: m.home_source_resources_description() },
    { title: m.home_source_scope_title(), description: m.home_source_scope_description() },
  ]
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-8">
      <div className="grid gap-10 rounded-2xl border border-border bg-card p-7 md:grid-cols-2 md:p-10">
        <div>
          <p className="mb-4 text-xs font-semibold tracking-widest text-primary">
            {m.home_source_eyebrow()}
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            {m.home_source_title()}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {m.home_source_description()}
          </p>
          <Link
            to="/{-$locale}/docs"
            params={{ locale: getLocale() }}
            className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
          >
            {m.home_source_cta()}
            <IconArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <dl className="divide-y divide-border">
          {items.map(({ title, description }) => (
            <div key={title} className="py-5 first:pt-0 last:pb-0">
              <dt className="flex items-center gap-3 font-semibold">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {title}
              </dt>
              <dd className="mt-2 pl-[18px] text-sm leading-relaxed text-muted-foreground">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function LanguagePreview() {
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  return (
    <fieldset aria-label={m.home_demo_language()}>
      <div className="flex gap-2">
        {(['zh', 'en'] as const).map((locale) => (
          <button
            key={locale}
            type="button"
            className="lab-preview-select"
            aria-pressed={language === locale}
            onClick={() => setLanguage(locale)}
          >
            {locale === 'zh' ? '中文' : 'English'}
          </button>
        ))}
      </div>
      <p className="lab-language-copy mt-5 text-base font-semibold" lang={language}>
        {language === 'zh' ? m.home_demo_zh() : m.home_demo_en()}
      </p>
    </fieldset>
  )
}

function CapabilityIllustration({ index }: { index: number }) {
  return (
    <div className="lab-preview mt-6" data-ambient>
      <p className="lab-preview-header">{m.home_demo_label()}</p>
      {index === 0 && (
        <div className="lab-auth-preview">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <IconShieldLock size={18} className="text-primary" aria-hidden />
            {m.home_demo_signin()}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <span className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {m.home_demo_email()}
            </span>
            <span className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {m.home_demo_password()} <span aria-hidden>••••••</span>
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{m.home_auth_google()}</span>
            <span className="rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground">
              {m.home_demo_continue()} <IconArrowUpRight className="inline" size={12} aria-hidden />
            </span>
          </div>
        </div>
      )}
      {index === 1 && (
        <div className="flex items-center gap-2 py-5">
          {[
            { label: m.home_payment_checkout(), Icon: IconCreditCard },
            { label: m.home_payment_portal(), Icon: IconShieldLock },
            { label: m.home_payment_webhook(), Icon: IconCode },
          ].map(({ label, Icon }, step) => (
            <div key={label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-[0.8]">
              <div className="lab-flow-node flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <Icon size={23} aria-hidden />
                <span className="text-[10px] sm:text-xs">{label}</span>
              </div>
              {step < 2 && <span className="lab-flow-line" aria-hidden />}
            </div>
          ))}
        </div>
      )}
      {index === 2 && (
        <div className="grid grid-cols-2 gap-2 py-3">
          {[
            { label: 'Workers', Icon: IconCloudUpload },
            { label: 'D1', Icon: IconDatabase },
            { label: 'R2', Icon: IconFile },
            { label: 'KV', Icon: IconBraces },
          ].map(({ label, Icon }) => (
            <div key={label} className="lab-stack-node">
              <Icon size={18} aria-hidden />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      )}
      {index === 3 && (
        <div className="space-y-2 py-3">
          <p className="mb-3 flex items-center gap-2 text-xs">
            <IconFile size={18} className="text-primary" aria-hidden />
            {m.home_demo_file()}
          </p>
          {['brand.svg', 'product.png'].map((file) => (
            <div key={file} className="lab-file-row flex items-center gap-2">
              <IconFile size={16} aria-hidden />
              <span className="min-w-0 flex-1 font-mono text-[11px]">{file}</span>
              <IconCheck size={14} className="text-primary" aria-hidden />
            </div>
          ))}
        </div>
      )}
      {index === 4 && (
        <div className="py-3 text-center">
          <div className="lab-mail-envelope mx-auto">
            <IconMail size={32} aria-hidden />
          </div>
          <p className="mt-4 text-xs font-medium">{m.home_demo_mail()}</p>
        </div>
      )}
      {index === 5 && <LanguagePreview />}
    </div>
  )
}

function CapabilityFeatures() {
  const features = homeBlocks.Features
  return (
    <Features
      {...features}
      items={features.items.map((item, index) => ({
        ...item,
        visual: <CapabilityIllustration index={index} />,
      }))}
    />
  )
}

/** 首页锚点兼容旧导航，消息始终在 render 时读取。 */
export function LandingPage() {
  const [paused, setPaused] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function visibilityChanged() {
      setPageVisible(!document.hidden)
    }
    visibilityChanged()
    document.addEventListener('visibilitychange', visibilityChanged)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.target.hasAttribute('data-ambient'))
                  entry.target.setAttribute('data-in-view', String(entry.isIntersecting))
                if (entry.isIntersecting) entry.target.setAttribute('data-revealed', 'true')
              }
            },
            { threshold: 0.12 },
          )
    root.current?.querySelectorAll('[data-ambient], .lab-reveal').forEach((element) => {
      observer?.observe(element)
    })
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [])

  return (
    <div
      ref={root}
      className="landing-lab"
      data-motion={paused || !pageVisible ? 'paused' : 'running'}
    >
      <div className="lab-hero">
        <div className="mx-auto flex max-w-6xl justify-end px-6 pt-6">
          <button
            type="button"
            className="lab-motion-toggle"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <IconPlayerPlay size={14} aria-hidden />
            ) : (
              <IconPlayerPause size={14} aria-hidden />
            )}
            {paused ? m.home_motion_resume() : m.home_motion_pause()}
          </button>
        </div>
        <Hero {...homeBlocks.Hero} visual={<LeapJourney paused={paused || !pageVisible} />} />
      </div>
      <TechnologyStrip />
      <StackAndToolkit />
      <section id="features" className="lab-reveal scroll-mt-16">
        <CapabilityFeatures />
      </section>
      <div className="lab-reveal">
        <Workflow />
      </div>
      <div className="lab-reveal">
        <SourceOverview />
      </div>
      <BrandStory />
      <section id="faq" className="lab-reveal scroll-mt-16">
        <Faq {...homeBlocks.Faq} />
      </section>
      <div className="lab-reveal">
        <Cta {...homeBlocks.Cta} />
      </div>
    </div>
  )
}
