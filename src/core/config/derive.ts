/**
 * 配置值 → 运行期 env 形状。
 *
 * `ServerEnv` 仍然是服务端消费方（支付 / 邮件 / 通知 / 认证）的统一取值形状，
 * 但值的**来源**换成了数据库：这里把配置字段翻译成同名 env 键，覆盖掉从部署
 * 环境解析出来的那份。没配的字段映射为 `undefined`——env 里的值只在 `db:seed`
 * 时作为初值使用，运行期不再生效。
 */
import type { RuntimeEnv, ServerEnv } from '@/core/env/server'
import type { SettingsValues } from './settings'

/** 配置字段 → `ServerEnv` 键。 */
const ENV_MAP: ReadonlyArray<readonly [fieldKey: string, envKey: string]> = [
  ['stripe.secretKey', 'STRIPE_SECRET_KEY'],
  ['stripe.webhookSecret', 'STRIPE_WEBHOOK_SECRET'],
  ['creem.apiKey', 'CREEM_API_KEY'],
  ['creem.webhookSecret', 'CREEM_WEBHOOK_SECRET'],
  ['creem.products', 'CREEM_PRODUCTS'],
  ['creem.debug', 'CREEM_DEBUG'],
  ['google.clientId', 'GOOGLE_CLIENT_ID'],
  ['google.clientSecret', 'GOOGLE_CLIENT_SECRET'],
  ['turnstile.secretKey', 'TURNSTILE_SECRET_KEY'],
  ['cloudflareEmail.sender', 'CLOUDFLARE_EMAIL_SENDER'],
  ['resend.apiKey', 'RESEND_API_KEY'],
  ['mail.from', 'MAIL_FROM'],
  ['resend.audienceId', 'RESEND_AUDIENCE_ID'],
  ['beehiiv.apiKey', 'BEEHIIV_API_KEY'],
  ['beehiiv.publicationId', 'BEEHIIV_PUBLICATION_ID'],
  ['beehiiv.sendWelcomeEmail', 'BEEHIIV_SEND_WELCOME_EMAIL'],
  ['notification.discordWebhookUrl', 'DISCORD_WEBHOOK_URL'],
  ['notification.feishuWebhookUrl', 'FEISHU_WEBHOOK_URL'],
]

function toEnvString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value === '' ? undefined : value
  return JSON.stringify(value)
}

export function settingsToServerEnv(values: SettingsValues, base: ServerEnv): RuntimeEnv {
  const next: Record<string, unknown> = { ...base }
  for (const [fieldKey, envKey] of ENV_MAP) {
    next[envKey] = toEnvString(values[fieldKey])
  }
  return next as unknown as RuntimeEnv
}
