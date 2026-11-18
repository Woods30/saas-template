import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { fetchAdminSettings, saveAdminSettings } from '@/core/config/admin'
import type { SettingsGroups, SettingsKey } from '@/core/config/settings'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 系统设置页（admin 专用）。
 *
 * 配置存在数据库里：每个分区单独保存，保存后进程内快照立即刷新，前台立刻生效。
 * 密钥类配置（支付 / 邮件凭据）不在这里——它们仍只在环境变量中。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/settings')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  head: () =>
    seo('/admin/settings', {
      title: m.admin_settings_title(),
      description: m.admin_settings_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminSettingsPage,
})

/** 社交平台清单：与 `SocialPlatform` 联合类型一一对应。 */
const SOCIAL_PLATFORMS = [
  'github',
  'x',
  'bluesky',
  'mastodon',
  'discord',
  'youtube',
  'linkedin',
  'facebook',
  'instagram',
  'tiktok',
  'telegram',
] as const

/** 分语言 SEO 覆盖的可编辑语言。 */
const SEO_LOCALES = ['zh', 'en'] as const

function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsGroups | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<SettingsKey | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'seo' | 'navigation' | 'modules' | 'all'>(
    'general',
  )

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminSettings()
      setSettings(result)
      setError(null)
    } catch {
      setError(m.settings_error_generic())
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 保存一个分区；成功刷新快照并提示，失败把错误留在页面上。 */
  async function save<K extends SettingsKey>(key: K, value: SettingsGroups[K]) {
    setSaving(key)
    setError(null)
    try {
      await saveAdminSettings({ data: { key, value } })
      await load()
      toast.add({ type: 'success', title: m.admin_settings_saved() })
    } catch {
      setError(m.admin_settings_save_failed())
    } finally {
      setSaving(null)
    }
  }

  if (settings === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
      </div>
    )
  }

  const tabs: Array<{
    id: 'general' | 'seo' | 'navigation' | 'modules' | 'all'
    label: string
  }> = [
    { id: 'general', label: m.admin_settings_tab_general() },
    { id: 'seo', label: m.admin_settings_tab_seo() },
    { id: 'navigation', label: m.admin_settings_tab_navigation() },
    { id: 'modules', label: m.admin_settings_tab_modules() },
    { id: 'all', label: m.admin_settings_tab_all() },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.admin_settings_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.admin_settings_description()}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          aria-label={m.admin_settings_title()}
          className="-mx-4 flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4 lg:sticky lg:top-6 lg:mx-0 lg:w-48 lg:flex-col lg:overflow-visible lg:border-b-0 lg:px-0"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:mb-0 lg:rounded-md lg:border-b-0 lg:px-3 lg:text-left ${
                activeTab === tab.id
                  ? 'border-primary text-foreground lg:bg-muted'
                  : 'border-transparent text-muted-foreground hover:text-foreground lg:hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {(activeTab === 'general' || activeTab === 'all') && (
            <BrandSection settings={settings} busy={saving === 'brand'} onSave={save} />
          )}
          {(activeTab === 'seo' || activeTab === 'all') && (
            <SeoSection settings={settings} busy={saving === 'seo'} onSave={save} />
          )}
          {(activeTab === 'navigation' || activeTab === 'all') && (
            <>
              <SocialSection settings={settings} busy={saving === 'social'} onSave={save} />
              <MailSection settings={settings} busy={saving === 'mail'} onSave={save} />
            </>
          )}
          {(activeTab === 'modules' || activeTab === 'all') && (
            <>
              <PaymentSection settings={settings} busy={saving === 'payment'} onSave={save} />
              <ModulesSection settings={settings} busy={saving === 'modules'} onSave={save} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 分区表单：标题 + 内容 + 保存按钮。 */
function Section({
  title,
  description,
  busy,
  onSave,
  children,
}: {
  title: string
  description?: string
  busy: boolean
  onSave: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      <CardFooter>
        <Button type="button" disabled={busy} onClick={onSave}>
          {busy ? m.admin_settings_saving() : m.admin_settings_save()}
        </Button>
      </CardFooter>
    </Card>
  )
}

function BrandSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'brand', value: SettingsGroups['brand']) => void
}) {
  const [name, setName] = useState(settings.brand.name)
  const [tagline, setTagline] = useState(settings.brand.tagline)
  const [logoAccent, setLogoAccent] = useState(settings.brand.logoAccent)

  return (
    <Section
      title={m.admin_settings_section_brand()}
      busy={busy}
      onSave={() => onSave('brand', { name, tagline, logoAccent })}
    >
      <Field>
        <FieldLabel htmlFor="brand-name">{m.admin_settings_brand_name()}</FieldLabel>
        <Input id="brand-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="brand-tagline">{m.admin_settings_brand_tagline()}</FieldLabel>
        <Input
          id="brand-tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="brand-accent">{m.admin_settings_brand_accent()}</FieldLabel>
        <Input
          id="brand-accent"
          value={logoAccent}
          onChange={(event) => setLogoAccent(event.target.value)}
        />
        <FieldDescription>{m.admin_settings_brand_accent()}</FieldDescription>
      </Field>
    </Section>
  )
}

function SeoSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'seo', value: SettingsGroups['seo']) => void
}) {
  const [defaultTitle, setDefaultTitle] = useState(settings.seo.default.title)
  const [defaultDescription, setDefaultDescription] = useState(settings.seo.default.description)
  const [defaultKeywords, setDefaultKeywords] = useState(settings.seo.default.keywords.join(', '))
  const [locales, setLocales] = useState(settings.seo.locales)

  const setLocaleField = (locale: string, field: 'title' | 'description', value: string) => {
    setLocales((current) => ({
      ...current,
      [locale]: { ...current[locale], [field]: value },
    }))
  }

  return (
    <Section
      title={m.admin_settings_section_seo()}
      busy={busy}
      onSave={() =>
        onSave('seo', {
          default: {
            title: defaultTitle,
            description: defaultDescription,
            keywords: defaultKeywords
              .split(',')
              .map((keyword) => keyword.trim())
              .filter((keyword) => keyword !== ''),
          },
          locales,
        })
      }
    >
      <Field>
        <FieldLabel htmlFor="seo-title">{m.admin_settings_seo_default_title()}</FieldLabel>
        <Input
          id="seo-title"
          value={defaultTitle}
          onChange={(event) => setDefaultTitle(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="seo-description">
          {m.admin_settings_seo_default_description()}
        </FieldLabel>
        <Textarea
          id="seo-description"
          value={defaultDescription}
          onChange={(event) => setDefaultDescription(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="seo-keywords">{m.admin_settings_seo_default_keywords()}</FieldLabel>
        <Input
          id="seo-keywords"
          value={defaultKeywords}
          onChange={(event) => setDefaultKeywords(event.target.value)}
        />
      </Field>
      {SEO_LOCALES.map((locale) => (
        <Field key={locale}>
          <FieldLabel htmlFor={`seo-locale-title-${locale}`}>
            {locale} · {m.admin_settings_seo_locale_title()}
          </FieldLabel>
          <Input
            id={`seo-locale-title-${locale}`}
            value={locales[locale]?.title ?? ''}
            onChange={(event) => setLocaleField(locale, 'title', event.target.value)}
          />
          <FieldLabel htmlFor={`seo-locale-description-${locale}`}>
            {locale} · {m.admin_settings_seo_locale_description()}
          </FieldLabel>
          <Textarea
            id={`seo-locale-description-${locale}`}
            value={locales[locale]?.description ?? ''}
            onChange={(event) => setLocaleField(locale, 'description', event.target.value)}
          />
        </Field>
      ))}
    </Section>
  )
}

function SocialSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'social', value: SettingsGroups['social']) => void
}) {
  const [links, setLinks] = useState<Record<string, string>>(settings.social.links)

  return (
    <Section
      title={m.admin_settings_section_social()}
      busy={busy}
      onSave={() => onSave('social', { links })}
    >
      {SOCIAL_PLATFORMS.map((platform) => (
        <Field key={platform}>
          <FieldLabel htmlFor={`social-${platform}`}>{platform}</FieldLabel>
          <Input
            id={`social-${platform}`}
            placeholder={m.admin_settings_social_placeholder()}
            value={links[platform] ?? ''}
            onChange={(event) =>
              setLinks((current) => ({ ...current, [platform]: event.target.value }))
            }
          />
        </Field>
      ))}
    </Section>
  )
}

function PaymentSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'payment', value: SettingsGroups['payment']) => void
}) {
  const [enabled, setEnabled] = useState(settings.payment.enabled)
  const [provider, setProvider] = useState(settings.payment.provider)
  const [checkoutMode, setCheckoutMode] = useState(settings.payment.checkoutMode)

  return (
    <Section
      title={m.admin_settings_section_payment()}
      busy={busy}
      onSave={() => onSave('payment', { enabled, provider, checkoutMode })}
    >
      <Field orientation="horizontal">
        <Switch id="payment-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor="payment-enabled">{m.admin_settings_payment_enabled()}</FieldLabel>
      </Field>
      <Field>
        <FieldLabel htmlFor="payment-provider">{m.admin_settings_payment_provider()}</FieldLabel>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as 'stripe' | 'creem')}
          items={[
            { value: 'stripe', label: 'Stripe' },
            { value: 'creem', label: 'Creem' },
          ]}
        >
          <SelectTrigger id="payment-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="creem">Creem</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="payment-checkout-mode">
          {m.admin_settings_payment_checkout_mode()}
        </FieldLabel>
        <Select
          value={checkoutMode}
          onValueChange={(value) => setCheckoutMode(value as 'provider' | 'collection')}
          items={[
            { value: 'provider', label: m.admin_settings_payment_checkout_mode_provider() },
            { value: 'collection', label: m.admin_settings_payment_checkout_mode_collection() },
          ]}
        >
          <SelectTrigger id="payment-checkout-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="provider">
              {m.admin_settings_payment_checkout_mode_provider()}
            </SelectItem>
            <SelectItem value="collection">
              {m.admin_settings_payment_checkout_mode_collection()}
            </SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>{m.admin_settings_payment_checkout_mode_hint()}</FieldDescription>
      </Field>
    </Section>
  )
}

function MailSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'mail', value: SettingsGroups['mail']) => void
}) {
  const [enabled, setEnabled] = useState(settings.mail.enabled)
  const [provider, setProvider] = useState(settings.mail.provider)
  const [supportEmail, setSupportEmail] = useState(settings.mail.supportEmail)

  return (
    <Section
      title={m.admin_settings_section_mail()}
      busy={busy}
      onSave={() => onSave('mail', { enabled, provider, supportEmail })}
    >
      <Field orientation="horizontal">
        <Switch id="mail-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor="mail-enabled">{m.admin_settings_mail_enabled()}</FieldLabel>
      </Field>
      <Field>
        <FieldLabel htmlFor="mail-provider">{m.admin_settings_mail_provider()}</FieldLabel>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as 'resend' | 'cloudflare')}
          items={[
            { value: 'resend', label: 'Resend' },
            { value: 'cloudflare', label: 'Cloudflare Email' },
          ]}
        >
          <SelectTrigger id="mail-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resend">Resend</SelectItem>
            <SelectItem value="cloudflare">Cloudflare Email</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="mail-support-email">
          {m.admin_settings_mail_support_email()}
        </FieldLabel>
        <Input
          id="mail-support-email"
          type="email"
          value={supportEmail}
          onChange={(event) => setSupportEmail(event.target.value)}
        />
      </Field>
    </Section>
  )
}

function ModulesSection({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsGroups
  busy: boolean
  onSave: (key: 'modules', value: SettingsGroups['modules']) => void
}) {
  const [modules, setModules] = useState(settings.modules)

  const setModule = (key: keyof Omit<SettingsGroups['modules'], 'features'>, value: boolean) => {
    setModules((current) => ({ ...current, [key]: value }))
  }
  const setFeature = (key: keyof SettingsGroups['modules']['features'], value: boolean) => {
    setModules((current) => ({
      ...current,
      features: { ...current.features, [key]: value },
    }))
  }

  const moduleRows: Array<{
    key: keyof Omit<SettingsGroups['modules'], 'features'>
    label: string
  }> = [
    { key: 'docs', label: m.admin_settings_module_docs() },
    { key: 'blog', label: m.admin_settings_module_blog() },
    { key: 'changelog', label: m.admin_settings_module_changelog() },
    { key: 'contact', label: m.admin_settings_module_contact() },
    { key: 'newsletter', label: m.admin_settings_module_newsletter() },
    { key: 'collection', label: m.admin_settings_module_collection() },
    { key: 'notification', label: m.admin_settings_module_notification() },
    { key: 'analytics', label: m.admin_settings_module_analytics() },
    { key: 'auth', label: m.admin_settings_module_auth() },
  ]

  const featureRows: Array<{
    key: keyof SettingsGroups['modules']['features']
    label: string
  }> = [
    { key: 'enableI18n', label: m.admin_settings_feature_i18n() },
    { key: 'enableFileUpload', label: m.admin_settings_feature_file_upload() },
    { key: 'enableApiKeys', label: m.admin_settings_feature_api_keys() },
    { key: 'enableAdmin', label: m.admin_settings_feature_admin() },
    { key: 'enableAIGateway', label: m.admin_settings_feature_ai_gateway() },
  ]

  return (
    <Section
      title={m.admin_settings_section_modules()}
      busy={busy}
      onSave={() => onSave('modules', modules)}
    >
      {moduleRows.map((row) => (
        <Field key={row.key} orientation="horizontal">
          <Switch
            id={`module-${row.key}`}
            checked={modules[row.key]}
            onCheckedChange={(value) => setModule(row.key, value)}
          />
          <FieldLabel htmlFor={`module-${row.key}`}>{row.label}</FieldLabel>
        </Field>
      ))}
      {featureRows.map((row) => (
        <Field key={row.key} orientation="horizontal">
          <Switch
            id={`feature-${row.key}`}
            checked={modules.features[row.key]}
            onCheckedChange={(value) => setFeature(row.key, value)}
          />
          <FieldLabel htmlFor={`feature-${row.key}`}>{row.label}</FieldLabel>
        </Field>
      ))}
    </Section>
  )
}
