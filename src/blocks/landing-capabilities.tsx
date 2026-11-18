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
import { createElement, useState } from 'react'
import { m } from '@/locale/paraglide/messages.js'
import { Features } from './features'

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

/** 首页「能力清单」区块：bento 特性卡 + 更多能力列表。 */
export function LandingCapabilities() {
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
