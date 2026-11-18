/**
 * 站点配置的形状与合并规则（纯函数，不碰数据库）。
 *
 * 配置分六组，与后台设置页的六个分区一一对应：
 * `brand`（品牌）、`seo`（SEO，分语言）、`social`（社交链接）、
 * `payment`（支付渠道）、`mail`（邮件）、`modules`（模块与能力开关）。
 *
 * 事实源有两层：
 * - **代码默认值**（`src/config/website.ts`）：clone 出来就能跑，不依赖数据库；
 * - **数据库配置**：后台改完即生效，覆盖默认值。
 *
 * 合并规则刻意保守：数据库里**缺失或非法**的字段一律回落到默认值，而不是
 * 让一个坏字段把整组配置带崩——后台存的是 JSON，坏了不该让站点打不开。
 */
import { z } from 'zod'
import { baseConfig, type WebsiteConfig } from '@/config/website'

export const SETTINGS_KEYS = ['brand', 'seo', 'social', 'payment', 'mail', 'modules'] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]

/** 品牌：出现在标题、页脚、OG 与 JSON-LD。 */
export const brandSchema = z.object({
  name: z.string().min(1),
  logoAccent: z.string(),
  tagline: z.string(),
})

/** 单个语言的 SEO。 */
export const seoLocaleSchema = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
})

/** SEO：默认文案 + 分语言覆盖。 */
export const seoSchema = z.object({
  default: seoLocaleSchema,
  locales: z.record(z.string(), seoLocaleSchema.partial()),
})

export const socialSchema = z.object({
  links: z.record(z.string(), z.string()),
})

export const paymentSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['stripe', 'creem']),
  /**
   * 结账链路：渠道支付与核销收款互斥。
   *
   * 带默认值 `provider`：这一项是后加的，早于它写入的 `payment` 分组没有这个
   * 键。不给默认值的话整个分组会因「缺字段」被判非法而整组回落默认值——后台
   * 改过的渠道开关会被一起抹掉。
   */
  checkoutMode: z.enum(['provider', 'collection']).default('provider'),
})

export const mailSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['resend', 'cloudflare']),
  supportEmail: z.string(),
})

export const modulesSchema = z.object({
  docs: z.boolean(),
  blog: z.boolean(),
  changelog: z.boolean(),
  contact: z.boolean(),
  newsletter: z.boolean(),
  /**
   * 核销型支付模块。
   *
   * 带默认值 `false`：这一项是后加的，早于它写入的 `modules` 分组没有这个键。
   * 不给默认值的话整个分组会因「缺字段」被判非法而整组回落默认值——后台改过的
   * 其它开关会被一起抹掉。
   */
  collection: z.boolean().default(false),
  notification: z.boolean(),
  analytics: z.boolean(),
  auth: z.boolean(),
  features: z.object({
    enableI18n: z.boolean(),
    enableFileUpload: z.boolean(),
    enableApiKeys: z.boolean(),
    enableAdmin: z.boolean(),
    enableAIGateway: z.boolean(),
  }),
})

export const settingsSchemas = {
  brand: brandSchema,
  seo: seoSchema,
  social: socialSchema,
  payment: paymentSchema,
  mail: mailSchema,
  modules: modulesSchema,
} as const

export type BrandSettings = z.infer<typeof brandSchema>
export type SeoSettings = z.infer<typeof seoSchema>
export type SocialSettings = z.infer<typeof socialSchema>
export type PaymentSettings = z.infer<typeof paymentSchema>
export type MailSettings = z.infer<typeof mailSchema>
export type ModuleSettings = z.infer<typeof modulesSchema>

export interface SettingsGroups {
  brand: BrandSettings
  seo: SeoSettings
  social: SocialSettings
  payment: PaymentSettings
  mail: MailSettings
  modules: ModuleSettings
}

/**
 * 代码默认值。
 *
 * 取自 `baseConfig`——那是**不随数据库变化**的出厂配置（已套用 env 白名单），
 * 数据库里没有对应分组时用它兜底。
 *
 * 刻意不读 `websiteConfig`：那是「当前生效配置」，读它会让上一轮的值变成这一轮的
 * 默认值——库里的分组被删掉后回不到出厂值。
 */
export function defaultSettings(): SettingsGroups {
  const config = baseConfig
  return {
    brand: {
      name: config.metadata.name,
      logoAccent: config.metadata.logoAccent,
      tagline: '',
    },
    seo: {
      default: { title: config.metadata.name, description: '', keywords: [] },
      locales: {},
    },
    social: { links: { ...config.social } },
    payment: {
      enabled: config.payment.enabled,
      provider: config.payment.provider,
      checkoutMode: config.payment.checkoutMode,
    },
    mail: {
      enabled: config.mail.enabled,
      provider: config.mail.provider,
      supportEmail: config.mail.supportEmail,
    },
    modules: {
      docs: config.docs.enabled,
      blog: config.blog.enabled,
      changelog: config.changelog.enabled,
      contact: config.contact.enabled,
      newsletter: config.newsletter.enabled,
      collection: config.collection.enabled,
      notification: config.notification.enabled,
      analytics: config.analytics.enabled,
      auth: config.auth.enabled,
      features: { ...config.features },
    },
  }
}

/**
 * 合并数据库里存的值与默认值。
 *
 * 每个分组独立校验：某一组坏了只丢那一组，其余照常用。全部分组都坏时等价于
 * 纯默认值——站点仍可用，只是后台改的东西没生效。
 */
export function mergeSettings(
  defaults: SettingsGroups,
  stored: Partial<Record<SettingsKey, unknown>>,
): SettingsGroups {
  const result = { ...defaults } as SettingsGroups
  for (const key of SETTINGS_KEYS) {
    const raw = stored[key]
    if (raw === undefined || raw === null) continue
    const parsed = settingsSchemas[key].safeParse(raw)
    if (!parsed.success) continue
    result[key] = parsed.data as never
  }
  return result
}

/**
 * 把配置分组合并进站点配置形状。
 *
 * 门禁、SEO、页脚等仍读 `WebsiteConfig`——那是全站统一的配置形状，
 * 这里只负责把数据库里的分组翻译成它。
 */
export function applySettingsToConfig(
  config: WebsiteConfig,
  settings: SettingsGroups,
): WebsiteConfig {
  return {
    ...config,
    metadata: {
      ...config.metadata,
      name: settings.brand.name,
      logoAccent: settings.brand.logoAccent,
    },
    social: { ...settings.social.links },
    seo: {
      default: { ...settings.seo.default },
      locales: { ...settings.seo.locales },
    },
    docs: { ...config.docs, enabled: settings.modules.docs },
    blog: { ...config.blog, enabled: settings.modules.blog },
    changelog: { ...config.changelog, enabled: settings.modules.changelog },
    contact: { ...config.contact, enabled: settings.modules.contact },
    newsletter: { ...config.newsletter, enabled: settings.modules.newsletter },
    collection: { ...config.collection, enabled: settings.modules.collection },
    notification: { ...config.notification, enabled: settings.modules.notification },
    analytics: { ...config.analytics, enabled: settings.modules.analytics },
    auth: { ...config.auth, enabled: settings.modules.auth },
    payment: {
      ...config.payment,
      enabled: settings.payment.enabled,
      provider: settings.payment.provider,
      checkoutMode: settings.payment.checkoutMode,
    },
    mail: {
      ...config.mail,
      enabled: settings.mail.enabled,
      provider: settings.mail.provider,
      supportEmail: settings.mail.supportEmail,
    },
    features: { ...settings.modules.features },
  }
}
