/**
 * 系统配置注册表：后台表单、保存校验与公开配置下发的**唯一事实来源**。
 *
 * 每个字段一行，按 `tab → group → field` 声明。`settings` 表里也按字段存
 * （key 就是这里的 `key`），不再存整组 JSON。
 *
 * 三条约束：
 * - 默认值只在这里出现一次；`createWebsiteConfig` 也从这里取初始值。
 * - `secret: true` 的字段加密入库，后台只回显末四位；未配置 `CONFIG_ENCRYPTION_KEY`
 *   时整组拒绝保存。
 * - `envKey` 只用于 `db:seed` 把部署环境里的旧值抄进数据库，运行期不再读 env。
 */
import { m } from '@/locale/paraglide/messages.js'

export type SettingKind =
  | 'text'
  | 'textarea'
  | 'password'
  | 'url'
  | 'email'
  | 'boolean'
  | 'select'
  | 'number'
  | 'list'
  | 'json'

export interface SettingField {
  /** 存储键，同时也是 `settings.key`。 */
  key: string
  kind: SettingKind
  label: () => string
  hint?: () => string
  secret?: boolean
  defaultValue: unknown
  options?: readonly string[]
  /** `db:seed` 的初值来源；仅迁移期使用。 */
  envKey?: string
}

export type SettingTabId =
  | 'general'
  | 'users'
  | 'content'
  | 'auth'
  | 'payment'
  | 'mail'
  | 'analytics'
  | 'notification'
  | 'custom'

export type SettingTestTarget = 'payment' | 'mail'

export interface SettingGroup {
  id: string
  title: () => string
  description?: () => string
  fields: readonly SettingField[]
  /** 「测试连接」探针；只有真正能探的服务才给。 */
  test?: SettingTestTarget
}

export interface SettingTab {
  id: SettingTabId
  label: () => string
  groups: readonly SettingGroup[]
}

/** 社交平台清单：与 `SocialPlatform` 联合类型一一对应。 */
export const SOCIAL_PLATFORMS = [
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

/** 可编辑 SEO 覆盖的语言。 */
export const SEO_LOCALES = ['zh', 'en'] as const

function text(
  key: string,
  label: () => string,
  defaultValue = '',
  extra: Partial<SettingField> = {},
): SettingField {
  return { key, kind: 'text', label, defaultValue, ...extra }
}

function boolean(
  key: string,
  label: () => string,
  defaultValue: boolean,
  extra: Partial<SettingField> = {},
): SettingField {
  return { key, kind: 'boolean', label, defaultValue, ...extra }
}

function secret(
  key: string,
  label: () => string,
  envKey: string,
  extra: Partial<SettingField> = {},
): SettingField {
  return { key, kind: 'password', label, secret: true, defaultValue: '', envKey, ...extra }
}

/**
 * 模块开关字段：按所属业务域拆开声明（顺序即后台展示顺序）。
 *
 * 认证不再有总闸：可用性由 `auth.emailEnabled` / `auth.googleEnabled` /
 * `auth.githubEnabled` 三个方法开关决定。
 */
const contentModuleFields: readonly SettingField[] = [
  boolean('modules.docs', m.admin_settings_module_docs, false),
  boolean('modules.blog', m.admin_settings_module_blog, true),
  boolean('modules.changelog', m.admin_settings_module_changelog, true),
  boolean('modules.contact', m.admin_settings_module_contact, false),
]

const paymentModuleFields: readonly SettingField[] = [
  boolean('modules.payment', m.admin_settings_payment_enabled, true),
  boolean('modules.manualPayments', m.admin_settings_module_manual_payments, false),
]

const mailModuleFields: readonly SettingField[] = [
  boolean('modules.mail', m.admin_settings_mail_enabled, true),
  boolean('modules.newsletter', m.admin_settings_module_newsletter, false),
]

const analyticsModuleFields: readonly SettingField[] = [
  boolean('modules.analytics', m.admin_settings_module_analytics, true),
]

const notificationModuleFields: readonly SettingField[] = [
  boolean('modules.notification', m.admin_settings_module_notification, false),
]

export const SETTING_TABS: readonly SettingTab[] = [
  {
    id: 'general',
    label: m.admin_settings_tab_general,
    groups: [
      {
        id: 'brand',
        title: m.admin_settings_section_brand,
        fields: [
          text('brand.name', m.admin_settings_brand_name, 'Jerbix'),
          text('brand.tagline', m.admin_settings_brand_tagline, ''),
          {
            key: 'brand.logoAccent',
            kind: 'text',
            label: m.admin_settings_brand_accent,
            hint: m.admin_settings_brand_accent,
            defaultValue: 'x',
          },
        ],
      },
      {
        id: 'seo',
        title: m.admin_settings_section_seo,
        fields: [
          text('seo.default.title', m.admin_settings_seo_default_title, 'Jerbix'),
          {
            key: 'seo.default.description',
            kind: 'textarea',
            label: m.admin_settings_seo_default_description,
            defaultValue: '',
          },
          {
            key: 'seo.default.keywords',
            kind: 'list',
            label: m.admin_settings_seo_default_keywords,
            defaultValue: [],
          },
          ...SEO_LOCALES.flatMap((locale): SettingField[] => [
            text(
              `seo.${locale}.title`,
              () => `${locale} · ${m.admin_settings_seo_locale_title()}`,
              '',
            ),
            {
              key: `seo.${locale}.description`,
              kind: 'textarea',
              label: () => `${locale} · ${m.admin_settings_seo_locale_description()}`,
              defaultValue: '',
            },
          ]),
        ],
      },
      {
        id: 'social',
        title: m.admin_settings_section_social,
        fields: SOCIAL_PLATFORMS.map((platform) =>
          text(`social.${platform}`, () => platform, '', {
            kind: 'url',
            hint: m.admin_settings_social_placeholder,
          }),
        ),
      },
    ],
  },
  {
    id: 'users',
    label: m.admin_settings_tab_users,
    groups: [
      {
        id: 'userFeatures',
        title: m.admin_settings_section_user_features,
        description: m.admin_settings_user_features_description,
        fields: [
          boolean('userFeatures.billing', m.admin_settings_user_feature_billing, true),
          boolean(
            'userFeatures.manualPayments',
            m.admin_settings_user_feature_manual_payments,
            true,
          ),
          boolean('userFeatures.apiKeys', m.admin_settings_user_feature_api_keys, true),
          boolean('userFeatures.notifications', m.admin_settings_user_feature_notifications, true),
        ],
      },
      {
        id: 'registration',
        title: m.admin_settings_section_registration,
        description: m.admin_settings_registration_description,
        fields: [
          {
            key: 'users.defaultRole',
            kind: 'select',
            label: m.admin_settings_users_default_role,
            hint: m.admin_settings_users_default_role_hint,
            defaultValue: 'viewer',
            options: ['viewer', 'editor'],
          },
          boolean('signupCredits.enabled', m.admin_settings_signup_credits_enabled, false),
          {
            key: 'signupCredits.amount',
            kind: 'number',
            label: m.admin_settings_signup_credits_amount,
            defaultValue: 0,
          },
          {
            key: 'signupCredits.validDays',
            kind: 'number',
            label: m.admin_settings_signup_credits_valid_days,
            hint: m.admin_settings_signup_credits_valid_days_hint,
            defaultValue: 0,
          },
          {
            key: 'signupCredits.description',
            kind: 'textarea',
            label: m.admin_settings_signup_credits_description,
            defaultValue: '',
          },
        ],
      },
    ],
  },
  {
    id: 'content',
    label: m.admin_settings_tab_content,
    groups: [
      {
        id: 'contentModules',
        title: m.admin_settings_section_content_modules,
        fields: contentModuleFields,
      },
      {
        id: 'docs',
        title: m.admin_settings_section_docs,
        fields: [
          text('docs.siteUrl', m.admin_settings_docs_site_url, '', { kind: 'url' }),
          text('docs.homeUrl', m.admin_settings_docs_home_url, '', { kind: 'url' }),
          boolean('docs.asHome', m.admin_settings_docs_as_home, false),
        ],
      },
    ],
  },
  {
    id: 'auth',
    label: m.admin_settings_tab_auth,
    groups: [
      {
        id: 'authMethods',
        title: m.admin_settings_section_auth_methods,
        fields: [
          boolean('auth.emailEnabled', m.admin_settings_auth_email_enabled, true),
          boolean('auth.googleEnabled', m.admin_settings_auth_google_enabled, true),
          boolean('auth.githubEnabled', m.admin_settings_auth_github_enabled, false),
          boolean(
            'auth.requireEmailVerification',
            m.admin_settings_auth_require_email_verification,
            true,
            { hint: m.admin_settings_auth_require_email_verification_hint },
          ),
        ],
      },
      {
        id: 'google',
        title: m.admin_settings_section_google,
        fields: [
          text('google.clientId', m.admin_settings_google_client_id, '', {
            envKey: 'GOOGLE_CLIENT_ID',
          }),
          secret(
            'google.clientSecret',
            m.admin_settings_google_client_secret,
            'GOOGLE_CLIENT_SECRET',
          ),
        ],
      },
      {
        id: 'github',
        title: m.admin_settings_section_github,
        fields: [
          text('github.clientId', m.admin_settings_github_client_id, '', {
            envKey: 'GITHUB_CLIENT_ID',
          }),
          secret(
            'github.clientSecret',
            m.admin_settings_github_client_secret,
            'GITHUB_CLIENT_SECRET',
          ),
        ],
      },
      {
        id: 'turnstile',
        title: m.admin_settings_section_turnstile,
        fields: [
          text('turnstile.siteKey', m.admin_settings_captcha_site_key, '', {
            envKey: 'VITE_TURNSTILE_SITE_KEY',
          }),
          secret(
            'turnstile.secretKey',
            m.admin_settings_captcha_secret_key,
            'TURNSTILE_SECRET_KEY',
          ),
        ],
      },
    ],
  },
  {
    id: 'payment',
    label: m.admin_settings_tab_payment,
    groups: [
      {
        id: 'paymentModules',
        title: m.admin_settings_section_payment_modules,
        fields: paymentModuleFields,
      },
      {
        id: 'payment',
        title: m.admin_settings_section_payment,
        description: m.admin_settings_payment_description,
        test: 'payment',
        fields: [
          {
            key: 'payment.provider',
            kind: 'select',
            label: m.admin_settings_payment_provider,
            defaultValue: 'stripe',
            options: ['stripe', 'creem'],
          },
          {
            key: 'payment.checkoutMode',
            kind: 'select',
            label: m.admin_settings_payment_checkout_mode,
            hint: m.admin_settings_payment_checkout_mode_hint,
            defaultValue: 'provider',
            options: ['provider', 'manual_payments'],
          },
        ],
      },
      {
        id: 'stripe',
        title: m.admin_settings_section_stripe,
        fields: [
          secret('stripe.secretKey', m.admin_settings_stripe_secret_key, 'STRIPE_SECRET_KEY'),
          secret(
            'stripe.webhookSecret',
            m.admin_settings_stripe_webhook_secret,
            'STRIPE_WEBHOOK_SECRET',
          ),
        ],
      },
      {
        id: 'creem',
        title: m.admin_settings_section_creem,
        fields: [
          secret('creem.apiKey', m.admin_settings_creem_api_key, 'CREEM_API_KEY'),
          secret(
            'creem.webhookSecret',
            m.admin_settings_creem_webhook_secret,
            'CREEM_WEBHOOK_SECRET',
          ),
          text('creem.products', m.admin_settings_creem_products, '', {
            envKey: 'CREEM_PRODUCTS',
            hint: m.admin_settings_creem_products_hint,
          }),
          boolean('creem.debug', m.admin_settings_creem_debug, false, { envKey: 'CREEM_DEBUG' }),
        ],
      },
      {
        id: 'manualPayments',
        title: m.admin_settings_section_manual_payments,
        fields: [
          {
            key: 'manualPayments.verificationSlaHours',
            kind: 'number',
            label: m.admin_settings_manual_payments_sla_hours,
            defaultValue: 24,
          },
          {
            key: 'manualPayments.accounts',
            kind: 'json',
            label: m.admin_settings_manual_payments_accounts,
            hint: m.admin_settings_manual_payments_accounts_hint,
            defaultValue: [],
            envKey: 'VITE_MANUAL_PAYMENT_ACCOUNTS',
          },
        ],
      },
    ],
  },
  {
    id: 'mail',
    label: m.admin_settings_tab_mail,
    groups: [
      {
        id: 'mailModules',
        title: m.admin_settings_section_mail_modules,
        fields: mailModuleFields,
      },
      {
        id: 'mail',
        title: m.admin_settings_section_mail,
        description: m.admin_settings_mail_description,
        test: 'mail',
        fields: [
          {
            key: 'mail.provider',
            kind: 'select',
            label: m.admin_settings_mail_provider,
            defaultValue: 'resend',
            options: ['resend', 'cloudflare'],
          },
          text('mail.supportEmail', m.admin_settings_mail_support_email, 'support@example.com', {
            kind: 'email',
          }),
          text('mail.from', m.admin_settings_mail_from, '', {
            kind: 'email',
            envKey: 'MAIL_FROM',
            hint: m.admin_settings_mail_from_hint,
          }),
        ],
      },
      {
        id: 'resend',
        title: m.admin_settings_section_resend,
        fields: [
          secret('resend.apiKey', m.admin_settings_resend_api_key, 'RESEND_API_KEY'),
          text('resend.audienceId', m.admin_settings_resend_audience_id, '', {
            envKey: 'RESEND_AUDIENCE_ID',
          }),
        ],
      },
      {
        id: 'cloudflareEmail',
        title: m.admin_settings_section_cloudflare_email,
        fields: [
          text('cloudflareEmail.sender', m.admin_settings_cloudflare_email_sender, '', {
            kind: 'email',
            envKey: 'CLOUDFLARE_EMAIL_SENDER',
          }),
        ],
      },
      {
        id: 'newsletter',
        title: m.admin_settings_section_newsletter,
        fields: [
          {
            key: 'newsletter.provider',
            kind: 'select',
            label: m.admin_settings_newsletter_provider,
            defaultValue: 'resend',
            options: ['resend', 'beehiiv'],
          },
        ],
      },
      {
        id: 'beehiiv',
        title: m.admin_settings_section_beehiiv,
        fields: [
          secret('beehiiv.apiKey', m.admin_settings_beehiiv_api_key, 'BEEHIIV_API_KEY'),
          text('beehiiv.publicationId', m.admin_settings_beehiiv_publication_id, '', {
            envKey: 'BEEHIIV_PUBLICATION_ID',
          }),
          boolean('beehiiv.sendWelcomeEmail', m.admin_settings_beehiiv_welcome, false, {
            envKey: 'BEEHIIV_SEND_WELCOME_EMAIL',
          }),
        ],
      },
    ],
  },
  {
    id: 'analytics',
    label: m.admin_settings_tab_analytics,
    groups: [
      {
        id: 'analyticsModules',
        title: m.admin_settings_section_analytics_modules,
        fields: analyticsModuleFields,
      },
      {
        id: 'analytics',
        title: m.admin_settings_section_analytics,
        fields: [
          {
            key: 'analytics.providers',
            kind: 'list',
            label: m.admin_settings_analytics_providers,
            hint: m.admin_settings_analytics_providers_hint,
            defaultValue: ['ga'],
          },
          text('analytics.gaId', m.admin_settings_analytics_ga_id, '', { envKey: 'VITE_GA_ID' }),
          text('analytics.plausibleDomain', m.admin_settings_analytics_plausible_domain, '', {
            envKey: 'VITE_PLAUSIBLE_DOMAIN',
          }),
          text('analytics.umamiWebsiteId', m.admin_settings_analytics_umami_id, '', {
            envKey: 'VITE_UMAMI_WEBSITE_ID',
          }),
          text('analytics.umamiScriptUrl', m.admin_settings_analytics_umami_script, '', {
            kind: 'url',
            envKey: 'VITE_UMAMI_SCRIPT_URL',
          }),
          text('analytics.clarityProjectId', m.admin_settings_analytics_clarity_id, '', {
            envKey: 'VITE_CLARITY_PROJECT_ID',
          }),
        ],
      },
    ],
  },
  {
    id: 'notification',
    label: m.admin_settings_tab_notify,
    groups: [
      {
        id: 'notificationModules',
        title: m.admin_settings_section_notification_modules,
        fields: notificationModuleFields,
      },
      {
        id: 'notification',
        title: m.admin_settings_section_notification,
        fields: [
          {
            key: 'notification.provider',
            kind: 'select',
            label: m.admin_settings_notification_provider,
            defaultValue: 'discord',
            options: ['discord', 'feishu'],
          },
          secret(
            'notification.discordWebhookUrl',
            m.admin_settings_notification_discord,
            'DISCORD_WEBHOOK_URL',
          ),
          secret(
            'notification.feishuWebhookUrl',
            m.admin_settings_notification_feishu,
            'FEISHU_WEBHOOK_URL',
          ),
        ],
      },
    ],
  },
  {
    id: 'custom',
    label: m.admin_settings_tab_custom,
    // 自定义配置不来自注册表：页面单独渲染 `CustomConfigPanel`。
    groups: [],
  },
]

/** 全部字段，按声明顺序摊平。 */
export const SETTING_FIELDS: readonly SettingField[] = SETTING_TABS.flatMap((tab) =>
  tab.groups.flatMap((group) => group.fields),
)

const FIELD_BY_KEY = new Map(SETTING_FIELDS.map((field) => [field.key, field]))

const GROUP_BY_ID = new Map(
  SETTING_TABS.flatMap((tab) => tab.groups.map((group) => [group.id, group] as const)),
)

const TAB_BY_GROUP = new Map(
  SETTING_TABS.flatMap((tab) => tab.groups.map((group) => [group.id, tab] as const)),
)

const TAB_BY_ID: ReadonlyMap<string, SettingTab> = new Map(
  SETTING_TABS.map((tab) => [tab.id, tab] as const),
)

export function settingField(key: string): SettingField | undefined {
  return FIELD_BY_KEY.get(key)
}

export function settingTab(id: string): SettingTab | undefined {
  return TAB_BY_ID.get(id)
}

export function settingGroup(id: string): SettingGroup | undefined {
  return GROUP_BY_ID.get(id)
}

export function groupTab(groupId: string): SettingTab | undefined {
  return TAB_BY_GROUP.get(groupId)
}

export function isSecretKey(key: string): boolean {
  return FIELD_BY_KEY.get(key)?.secret === true
}

/**
 * 出厂值。
 *
 * 深拷贝：数组与对象字段（列表、收款账户）共享引用的话，调用方改一次就把
 * 注册表里的默认值一起改了。
 */
export function defaultSettingsValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of SETTING_FIELDS) {
    values[field.key] = structuredClone(field.defaultValue)
  }
  return values
}
