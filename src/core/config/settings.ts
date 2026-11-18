/**
 * 配置值解析与落到站点配置（纯函数，不碰数据库）。
 *
 * 存储侧：`settings` 表一个字段一行，值是 JSON（保留布尔 / 数字 / 数组的类型）。
 * 读取侧：逐字段校验，**坏字段只丢该字段**，回落默认值——后台写进来的东西可能被
 * 手工改坏，坏一个字段不该让整站配置垮掉。
 *
 * 字段清单与默认值都在 `registry.ts`，这里只负责「怎么校验」与「怎么用」。
 */

import type { AnalyticsName, PaymentProviderName, WebsiteConfig } from '@/config/website'
import type { CollectionAccountConfig } from '@/types/collection'
import {
  defaultSettingsValues,
  SETTING_FIELDS,
  type SettingField,
  settingField,
  settingGroup,
} from './registry'

export type SettingsValues = Record<string, unknown>

/** 校验失败：消息只含字段键与原因，不含原始值（避免把口令写进日志）。 */
export class SettingsValidationError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`配置项 ${field} 不合法：${reason}`)
    this.name = 'SettingsValidationError'
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertSafeUrl(field: string, value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SettingsValidationError(field, '不是合法 URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SettingsValidationError(field, '必须是 http(s) URL')
  }
  if (url.username || url.password) {
    throw new SettingsValidationError(field, 'URL 不得内嵌凭据')
  }
}

/**
 * 单个字段的校验与归一化。
 *
 * 空字符串在 url / email 上是合法的「未设置」：后台清空一个已填的值是正常操作，
 * 不该被判为非法。
 */
export function parseFieldValue(field: SettingField, raw: unknown): unknown {
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'password': {
      if (typeof raw !== 'string') throw new SettingsValidationError(field.key, '必须是文本')
      return raw
    }
    case 'url': {
      if (typeof raw !== 'string') throw new SettingsValidationError(field.key, '必须是文本')
      if (raw !== '') assertSafeUrl(field.key, raw)
      return raw
    }
    case 'email': {
      if (typeof raw !== 'string') throw new SettingsValidationError(field.key, '必须是文本')
      if (raw !== '' && !EMAIL_PATTERN.test(raw)) {
        throw new SettingsValidationError(field.key, '必须是邮箱地址')
      }
      return raw
    }
    case 'boolean': {
      if (typeof raw !== 'boolean') throw new SettingsValidationError(field.key, '必须是布尔值')
      return raw
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        throw new SettingsValidationError(field.key, '必须是非负数字')
      }
      return raw
    }
    case 'select': {
      if (typeof raw !== 'string' || !field.options?.includes(raw)) {
        throw new SettingsValidationError(field.key, '取值不在可选项中')
      }
      return raw
    }
    case 'list': {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
        throw new SettingsValidationError(field.key, '必须是字符串列表')
      }
      return raw
    }
    case 'json': {
      if (!Array.isArray(raw)) throw new SettingsValidationError(field.key, '必须是数组')
      return raw
    }
  }
}

/**
 * 把库里读到的值解析成完整配置。
 *
 * `stored` 的键是字段键，值已经是 JSON 解析后的原始值（密钥已在调用方解密）。
 * 未存、解析失败或校验不过的字段一律回落默认值。
 */
export function resolveSettingsValues(stored: Record<string, unknown>): SettingsValues {
  const values = defaultSettingsValues()
  for (const field of SETTING_FIELDS) {
    const raw = stored[field.key]
    if (raw === undefined || raw === null) continue
    try {
      values[field.key] = parseFieldValue(field, raw)
    } catch {
      // 坏字段回落到默认值，其余字段照常。
    }
  }
  return values
}

/**
 * 校验一组提交值，返回只含该组字段的归一化结果。
 *
 * 保存是**按组**的：后台一次提交一张卡片。组外的键直接忽略，组内的键逐个校验，
 * 任一失败即整组拒绝——半组合法半组非法地落库，页面与库会长期不一致。
 */
export function validateGroupValues(
  groupId: string,
  input: Record<string, unknown>,
): SettingsValues {
  const group = settingGroup(groupId)
  if (!group) throw new SettingsValidationError(groupId, '配置分组不存在')
  const result: SettingsValues = {}
  for (const field of group.fields) {
    if (!(field.key in input)) continue
    result[field.key] = parseFieldValue(field, input[field.key])
  }
  return result
}

/** 组里是否含密钥字段：含则保存前必须有 `CONFIG_ENCRYPTION_KEY`。 */
export function groupHasSecrets(groupId: string): boolean {
  const group = settingGroup(groupId)
  return group?.fields.some((field) => field.secret === true) === true
}

/** 组里的密钥字段键。 */
export function groupSecretKeys(groupId: string): string[] {
  const group = settingGroup(groupId)
  return group?.fields.filter((field) => field.secret).map((field) => field.key) ?? []
}

function str(values: SettingsValues, key: string): string {
  const value = values[key]
  return typeof value === 'string' ? value : ''
}

function bool(values: SettingsValues, key: string): boolean {
  return values[key] === true
}

function num(values: SettingsValues, key: string, fallback: number): number {
  const value = values[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function strList(values: SettingsValues, key: string): string[] {
  const value = values[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

const ANALYTICS_NAMES: readonly AnalyticsName[] = ['ga', 'plausible', 'umami', 'clarity']

/**
 * 把配置值落到站点配置形状。
 *
 * 门禁、SEO、页脚仍读 `WebsiteConfig`——那是全站统一的配置形状；这里负责把扁平的
 * 字段翻译成它。认证 / 支付 / 邮件等「是否启用」在配置里有两处（模块开关与各分类
 * 的 `enabled`），统一以 `modules.*` 为准，避免两份开关打架。
 */
export function applySettingsToConfig(
  config: WebsiteConfig,
  values: SettingsValues,
): WebsiteConfig {
  const social: WebsiteConfig['social'] = {}
  for (const field of SETTING_FIELDS) {
    if (!field.key.startsWith('social.')) continue
    const platform = field.key.slice('social.'.length) as keyof WebsiteConfig['social']
    const url = str(values, field.key)
    if (url) social[platform] = url
  }

  const locales: WebsiteConfig['seo']['locales'] = {}
  for (const locale of ['zh', 'en'] as const) {
    const title = str(values, `seo.${locale}.title`)
    const description = str(values, `seo.${locale}.description`)
    if (!title && !description) continue
    locales[locale] = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    }
  }

  const provider = str(values, 'payment.provider')
  const checkoutMode = str(values, 'payment.checkoutMode')
  const mailProvider = str(values, 'mail.provider')
  const newsletterProvider = str(values, 'newsletter.provider')
  const notificationProvider = str(values, 'notification.provider')
  const analyticsProviders = strList(values, 'analytics.providers').filter(
    (name): name is AnalyticsName => ANALYTICS_NAMES.includes(name as AnalyticsName),
  )
  const collectionAccounts = Array.isArray(values['collection.accounts'])
    ? (values['collection.accounts'] as CollectionAccountConfig[])
    : []

  return {
    ...config,
    metadata: {
      ...config.metadata,
      name: str(values, 'brand.name') || config.metadata.name,
      logoAccent: str(values, 'brand.logoAccent'),
    },
    social,
    seo: {
      default: {
        title: str(values, 'seo.default.title'),
        description: str(values, 'seo.default.description'),
        keywords: strList(values, 'seo.default.keywords'),
      },
      locales,
    },
    docs: {
      enabled: bool(values, 'modules.docs'),
      asHome: bool(values, 'docs.asHome'),
      ...(str(values, 'docs.siteUrl') ? { siteUrl: str(values, 'docs.siteUrl') } : {}),
      ...(str(values, 'docs.homeUrl') ? { homeUrl: str(values, 'docs.homeUrl') } : {}),
    },
    blog: { enabled: bool(values, 'modules.blog') },
    changelog: { enabled: bool(values, 'modules.changelog') },
    mail: {
      enabled: bool(values, 'modules.mail'),
      provider: mailProvider === 'cloudflare' ? 'cloudflare' : 'resend',
      supportEmail: str(values, 'mail.supportEmail'),
    },
    contact: { enabled: bool(values, 'modules.contact') },
    newsletter: {
      enabled: bool(values, 'modules.newsletter'),
      provider: newsletterProvider === 'beehiiv' ? 'beehiiv' : 'resend',
    },
    payment: {
      enabled: bool(values, 'modules.payment'),
      provider: (provider === 'creem' ? 'creem' : 'stripe') satisfies PaymentProviderName,
      checkoutMode: checkoutMode === 'collection' ? 'collection' : 'provider',
    },
    collection: {
      enabled: bool(values, 'modules.collection'),
      verificationSlaHours: num(values, 'collection.verificationSlaHours', 24),
      accounts: collectionAccounts,
    },
    notification: {
      enabled: bool(values, 'modules.notification'),
      provider: notificationProvider === 'feishu' ? 'feishu' : 'discord',
    },
    analytics: {
      enabled: bool(values, 'modules.analytics'),
      providers: analyticsProviders,
      config: {
        ...(str(values, 'analytics.gaId') ? { gaId: str(values, 'analytics.gaId') } : {}),
        ...(str(values, 'analytics.plausibleDomain')
          ? { plausibleDomain: str(values, 'analytics.plausibleDomain') }
          : {}),
        ...(str(values, 'analytics.umamiWebsiteId')
          ? { umamiWebsiteId: str(values, 'analytics.umamiWebsiteId') }
          : {}),
        ...(str(values, 'analytics.umamiScriptUrl')
          ? { umamiScriptUrl: str(values, 'analytics.umamiScriptUrl') }
          : {}),
        ...(str(values, 'analytics.clarityProjectId')
          ? { clarityProjectId: str(values, 'analytics.clarityProjectId') }
          : {}),
      },
    },
    auth: {
      enabled: bool(values, 'modules.auth'),
      requireEmailVerification: bool(values, 'auth.requireEmailVerification'),
    },
    captcha: {
      ...(str(values, 'turnstile.siteKey') ? { siteKey: str(values, 'turnstile.siteKey') } : {}),
    },
    features: {
      enableI18n: bool(values, 'features.enableI18n'),
      enableFileUpload: bool(values, 'features.enableFileUpload'),
      enableApiKeys: bool(values, 'features.enableApiKeys'),
      enableAdmin: bool(values, 'features.enableAdmin'),
      enableAIGateway: bool(values, 'features.enableAIGateway'),
    },
  }
}

export { settingField }
