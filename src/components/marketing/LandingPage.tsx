import {
  IconArrowUpRight,
  IconBraces,
  IconCheck,
  IconCloud,
  IconCloudUpload,
  IconCode,
  IconCreditCard,
  IconDatabase,
  IconFile,
  IconLanguage,
  IconMail,
  IconPlugConnected,
  IconShieldLock,
} from '@tabler/icons-react'
import { createElement, useId, useState } from 'react'
import { useSession } from '@/auth/client'
import { SourceProductDemo } from '@/components/marketing/SourceProductDemo'
import { Cta, Faq, Features } from '@/components/sections'
import { Button, buttonVariants } from '@/components/ui/button'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { startCheckout } from '@/payment/checkout-client'
import { formatUsdAmount } from '@/payment/price-catalog'

/** docs 开关启用时指向当前语言的文档入口，关闭时回退首页锚点。 */
function docsCtaHref(): string {
  return websiteConfig.docs.enabled ? `/${getLocale()}/docs` : '#features'
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
          <div className="lab-terminal-rule flex items-center justify-between gap-3 border-b px-5 py-4 text-xs">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2 rounded-full bg-highlight" />
              <span className="lab-terminal-dot size-2 rounded-full" />
              <span className="lab-terminal-dot-faint size-2 rounded-full" />
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

/**
 * 模板买断价（分）；`null` 表示价格目录取不到。
 *
 * 金额由 Stripe 的价格目录给出（见 `fetchPriceCatalog`），代码里不存第二份。
 */
function TemplatePricing({ price }: { price: string | null }) {
  const id = useId()
  const { data: session, isPending } = useSession()
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const locale = getLocale()
  const loginUrl = `/${locale}/auth/login?redirect=${encodeURIComponent(`/${locale}/#pricing`)}`
  const enabled = websiteConfig.auth.enabled && websiteConfig.payment.enabled

  async function buy() {
    if (pending) return
    setPending(true)
    setNotice('')
    const result = await startCheckout({
      productId: websiteConfig.template.productId,
      offerId: websiteConfig.template.offerId,
      locale,
    })
    if (result.kind === 'redirect') {
      window.location.assign(result.url)
      return
    }
    if (result.kind === 'unauthenticated') {
      window.location.assign(loginUrl)
      return
    }
    setPending(false)
    setNotice(
      result.kind === 'not-configured'
        ? m.payment_checkout_not_configured()
        : result.kind === 'error' && result.message === 'checkout_pending'
          ? m.payment_checkout_pending()
          : m.payment_checkout_error(),
    )
  }
  const benefits = [
    m.home_pricing_source(),
    m.home_pricing_support(),
    m.home_pricing_updates(),
    m.home_pricing_modules(),
  ]
  return (
    <section
      id="pricing"
      aria-labelledby={id}
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 md:py-24"
    >
      <div className="grid gap-10 rounded-xl border border-border bg-card p-7 md:grid-cols-2 md:p-12">
        <div>
          <h2 id={id} className="text-3xl font-semibold tracking-tight md:text-4xl">
            {m.home_pricing_title()}
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
            {m.home_pricing_description()}
          </p>
          <ul className="mt-7 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm">
                <IconCheck size={18} className="text-success" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start justify-center md:pl-10">
          <p className="text-5xl font-semibold tracking-tight">{price ?? '—'}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {price ? m.home_pricing_once() : m.home_pricing_price_unavailable()}
          </p>
          {enabled && !isPending && !session ? (
            <a
              href={loginUrl}
              className={buttonVariants({ className: 'mt-7 h-auto min-h-11 px-5 py-3' })}
            >
              {m.home_pricing_buy()}
            </a>
          ) : (
            <Button
              disabled={!enabled || isPending || pending}
              onClick={() => void buy()}
              aria-busy={pending}
              className="mt-7 h-auto min-h-11 px-5 py-3"
            >
              {pending ? m.payment_checkout_opening() : m.home_pricing_buy()}
            </Button>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm text-destructive">
              {notice}
            </p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            {m.home_source_resources_description()}
          </p>
        </div>
      </div>
    </section>
  )
}

function ValuePropositions() {
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
  const items = [
    {
      icon: createElement(IconShieldLock, { size: 22 }),
      title: m.home_features_auth_title(),
      description: m.home_features_auth_description(),
      detail: m.home_features_auth_detail(),
      wide: true,
    },
    {
      icon: createElement(IconCreditCard, { size: 22 }),
      title: m.home_features_payment_title(),
      description: m.home_features_payment_description(),
      detail: m.home_features_payment_detail(),
      wide: true,
    },
    {
      icon: createElement(IconCloud, { size: 22 }),
      title: m.home_features_edge_title(),
      description: m.home_features_edge_description(),
      detail: m.home_features_edge_detail(),
    },
    {
      icon: createElement(IconDatabase, { size: 22 }),
      title: m.home_features_storage_title(),
      description: m.home_features_storage_description(),
      detail: m.home_features_storage_detail(),
    },
    {
      icon: createElement(IconMail, { size: 22 }),
      title: m.home_features_email_title(),
      description: m.home_features_email_description(),
      detail: m.home_features_email_detail(),
    },
    {
      icon: createElement(IconLanguage, { size: 22 }),
      title: m.home_features_i18n_title(),
      description: m.home_features_i18n_description(),
      detail: m.home_features_i18n_detail(),
    },
  ]
  const more = [
    { title: m.home_feature_seo(), description: m.home_feature_seo_description(), Icon: IconCode },
    {
      title: m.home_feature_api(),
      description: m.home_feature_api_description(),
      Icon: IconShieldLock,
    },
    {
      title: m.home_feature_marketing(),
      description: m.home_feature_marketing_description(),
      Icon: IconBraces,
    },
    {
      title: m.home_feature_docs(),
      description: m.home_feature_docs_description(),
      Icon: IconFile,
    },
    {
      title: m.home_feature_notification(),
      description: m.home_feature_notification_description(),
      Icon: IconMail,
    },
    {
      title: m.home_feature_updates(),
      description: m.home_feature_updates_description(),
      Icon: IconPlugConnected,
    },
  ]
  return (
    <>
      <Features
        title={m.home_features_title()}
        subtitle={m.home_features_subtitle()}
        variant="bento"
        items={items.map((item, index) => ({
          ...item,
          visual: <CapabilityIllustration index={index} />,
        }))}
      />
      <div className="mx-auto max-w-6xl px-6 pb-16">
        <h3 className="text-2xl font-semibold tracking-tight">{m.home_features_more_title()}</h3>
        <p className="mt-3 text-sm text-muted-foreground">{m.home_features_more_description()}</p>
        <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {more.map(({ title, description, Icon }) => (
            <article key={title} className="border-t border-border pt-5">
              <Icon size={22} className="text-primary" aria-hidden />
              <h4 className="mt-3 font-semibold">{title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}

export function LandingPage({ priceCents }: { priceCents: number | null }) {
  const [motionRunning, setMotionRunning] = useState(true)
  // 价格事实源是 Stripe 的价格目录；取不到时降级为「价格暂不可用」，不编造金额。
  const price = priceCents === null ? null : formatUsdAmount(priceCents)
  return (
    <div className="landing-lab" data-motion={motionRunning ? 'running' : 'paused'}>
      <section className="lab-hero !bg-none mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="min-w-0">
          <p className="mb-6 flex items-center gap-3 font-semibold" lang="en">
            <svg
              width="25"
              height="20"
              viewBox="0 0 28 20"
              fill="none"
              className="text-primary"
              aria-hidden="true"
            >
              <path
                d="M1 17Q7 2 13 11Q20 -5 27 4"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            {m.brand_slogan()}
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {m.home_hero_title()}
            {getLocale() === 'en' ? ' ' : ''}
            <br />
            {m.home_hero_title_emphasis()}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            {m.home_hero_description()}
          </p>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {m.home_hero_subtitle()}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#pricing"
              className={buttonVariants({ className: 'h-auto min-h-11 px-5 py-3' })}
            >
              {price ? m.home_hero_primary_cta({ price }) : m.home_hero_primary_cta_unknown()}
            </a>
            <a
              href={docsCtaHref()}
              className={buttonVariants({
                variant: 'outline',
                className: 'h-auto min-h-11 px-5 py-3',
              })}
            >
              {m.home_hero_secondary_cta()}
            </a>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">{m.home_hero_note()}</p>
        </div>
        <SourceProductDemo replayKey={0} onMotionChange={setMotionRunning} />
      </section>
      <ValuePropositions />
      <TechnologyStrip />
      <section id="features" className="scroll-mt-16">
        <CapabilityFeatures />
      </section>
      <StackAndToolkit />
      <Workflow />
      <TemplatePricing price={price} />
      <BrandStory />
      <section id="faq" className="scroll-mt-16">
        <Faq
          title={m.home_faq_title()}
          variant="split"
          items={[
            { question: m.home_faq_q1(), answer: m.home_faq_a1() },
            { question: m.home_faq_q2(), answer: m.home_faq_a2() },
            { question: m.home_faq_q3(), answer: m.home_faq_a3() },
            { question: m.home_faq_q4(), answer: m.home_faq_a4() },
            { question: m.home_faq_q5(), answer: m.home_faq_a5() },
          ]}
        />
      </section>
      <Cta
        title={m.home_cta_title()}
        description={m.home_cta_description()}
        primaryCta={{ label: m.home_cta_primary(), href: '#pricing' }}
        variant="quiet"
      />
    </div>
  )
}
