import { z } from 'zod'
import type { PublicEnv } from '@/env/public'
import type { ServerEnv } from '@/env/server'
import { findOrphanPlanIds } from './payment'
import type { ServiceModule, WebsiteConfig } from './website'

/**
 * 服务配置诊断。
 *
 * 纯函数，不发起网络请求、不读取 `import.meta.env` / `process.env`，也不回显任何凭据值。
 * 公开 env、服务端 env 与资源 binding 存在性都由调用方解析后传入，便于 CLI 与单测复用。
 *
 * 状态只表示「开关与必要字段是否齐备」，**不代表**外部服务 ready 或投递 / 收款成功。
 */
export type ConfigIssue = {
  key: string
  reason: string
  location: 'src/config/website.ts' | 'env' | 'Cloudflare binding'
  manual?: boolean
  /** 配置矛盾（字段存在但取值互斥），而非字段缺失。仅影响诊断文案的分组标签。 */
  conflict?: boolean
}

export type ServiceStatus = {
  state: 'disabled' | 'incomplete' | 'configured'
  issues: ConfigIssue[]
}

/**
 * 归一化默认发件人。
 *
 * 优先 `MAIL_FROM`；缺失且 provider 为 Cloudflare 时回退兼容字段 `CLOUDFLARE_EMAIL_SENDER`。
 * Resend 不借用 Cloudflare sender，也不回退 `example.com`（缺失即返回 `undefined`）。
 */
export function getMailFrom(config: WebsiteConfig, env: ServerEnv): string | undefined {
  return (
    env.MAIL_FROM ??
    (config.mail.provider === 'cloudflare' ? env.CLOUDFLARE_EMAIL_SENDER : undefined)
  )
}

const REQUIRED_CONFIG_REASON = '已启用模块缺少必要配置'
const DEPLOYMENT_CHECK_REASON = '部署时核对 binding 与实际收件限制'

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function isRootOrProtocolRelativePath(value: string): boolean {
  // root-relative（`/logo.svg`）与 protocol-relative（`//cdn/logo.svg`）均以 `/` 开头。
  return value.startsWith('/')
}

export function getServiceStatuses(input: {
  config: WebsiteConfig
  publicEnv: PublicEnv
  serverEnv: ServerEnv
  bindings?: { email: boolean }
}): Record<ServiceModule, ServiceStatus> {
  const { config, publicEnv: pub, serverEnv: env, bindings } = input
  // 受控本地断言：每个 ServiceModule 键都会在下方被 `check` 完整赋值后才返回，
  // 不借助断言绕过 Router 或 env 校验。
  const result = {} as Record<ServiceModule, ServiceStatus>
  const check = (
    name: ServiceModule,
    requirements: Array<[string, boolean, ConfigIssue['location']]>,
    manualIssues: ConfigIssue[] = [],
    // 与 manualIssues 不同：这些**计入** completeness 判定，用于表达配置矛盾
    // （字段存在但取值互斥）这类无法用「某字段是否提供」描述的缺陷。
    conflictIssues: ConfigIssue[] = [],
  ) => {
    const issues = config[name].enabled
      ? requirements
          .filter(([, valid]) => !valid)
          .map(([key, , location]) => ({ key, location, reason: REQUIRED_CONFIG_REASON }))
      : []
    result[name] = {
      state: !config[name].enabled
        ? 'disabled'
        : issues.length + conflictIssues.length
          ? 'incomplete'
          : 'configured',
      // manual 核对项仅用于部署提示，不参与 completeness 判定，故不进入 issues.length。
      issues: config[name].enabled ? [...issues, ...conflictIssues, ...manualIssues] : [],
    }
  }

  const mailManual: ConfigIssue[] =
    config.mail.enabled && config.mail.provider === 'cloudflare' && !bindings
      ? [
          {
            key: 'EMAIL',
            location: 'Cloudflare binding',
            reason: DEPLOYMENT_CHECK_REASON,
            manual: true,
          },
        ]
      : []

  check(
    'mail',
    config.mail.provider === 'resend'
      ? [
          ['RESEND_API_KEY', !!env.RESEND_API_KEY, 'env'],
          ['MAIL_FROM', !!env.MAIL_FROM, 'env'],
        ]
      : [
          ['MAIL_FROM / CLOUDFLARE_EMAIL_SENDER', !!getMailFrom(config, env), 'env'],
          ['EMAIL', bindings?.email !== false, 'Cloudflare binding'],
        ],
    mailManual,
  )

  check('contact', [
    ['mail.enabled', result.mail.state === 'configured', 'src/config/website.ts'],
    [
      'mail.supportEmail',
      z.email().safeParse(config.mail.supportEmail).success,
      'src/config/website.ts',
    ],
  ])

  check(
    'newsletter',
    config.newsletter.provider === 'resend'
      ? [
          ['RESEND_API_KEY', !!env.RESEND_API_KEY, 'env'],
          ['RESEND_AUDIENCE_ID', !!env.RESEND_AUDIENCE_ID, 'env'],
        ]
      : [
          ['BEEHIIV_API_KEY', !!env.BEEHIIV_API_KEY, 'env'],
          ['BEEHIIV_PUBLICATION_ID', !!env.BEEHIIV_PUBLICATION_ID, 'env'],
        ],
  )

  check('payment', [
    ['STRIPE_SECRET_KEY', !!env.STRIPE_SECRET_KEY, 'env'],
    ['STRIPE_WEBHOOK_SECRET', !!env.STRIPE_WEBHOOK_SECRET, 'env'],
    // `allowedPriceIds` 与 `priceMap` 同源，因此「配齐了 Price」与「白名单非空」
    // 是同一件事。空白名单会让 /api/payment 放行任意 priceId，故仍然作为必需项。
    [
      'payment.allowedPriceIds',
      config.payment.allowedPriceIds.some((id) => id.trim().length > 0),
      'src/config/website.ts',
    ],
  ])

  // 只校验当前选中 provider 对应的 webhook：配了 Discord 却选 feishu 仍是 incomplete。
  const notificationWebhookKey =
    config.notification.provider === 'discord' ? 'DISCORD_WEBHOOK_URL' : 'FEISHU_WEBHOOK_URL'
  check('notification', [[notificationWebhookKey, !!env[notificationWebhookKey], 'env']])

  const analytics: Array<[string, boolean, ConfigIssue['location']]> = [
    ['analytics.providers', config.analytics.providers.length > 0, 'src/config/website.ts'],
  ]
  for (const provider of config.analytics.providers) {
    if (provider === 'ga') analytics.push(['VITE_GA_ID', !!pub.VITE_GA_ID, 'env'])
    if (provider === 'plausible')
      analytics.push(['VITE_PLAUSIBLE_DOMAIN', !!pub.VITE_PLAUSIBLE_DOMAIN, 'env'])
    if (provider === 'umami')
      analytics.push(
        [
          'VITE_UMAMI_WEBSITE_ID / VITE_UMAMI_ID',
          !!(pub.VITE_UMAMI_WEBSITE_ID ?? pub.VITE_UMAMI_ID),
          'env',
        ],
        ['VITE_UMAMI_SCRIPT_URL', !!pub.VITE_UMAMI_SCRIPT_URL, 'env'],
      )
    if (provider === 'clarity')
      analytics.push([
        'VITE_CLARITY_PROJECT_ID / VITE_CLARITY_ID',
        !!(pub.VITE_CLARITY_PROJECT_ID ?? pub.VITE_CLARITY_ID),
        'env',
      ])
  }
  check('analytics', analytics)

  // auth 没有「运行期必需」的 env：
  // - `BETTER_AUTH_SECRET` 缺失时 better-auth 会退回自带的开发期密钥，本地开发照常可用；
  //   生产环境的强制校验由 `check-env-prod`（`validateProdServerEnv`）在部署前完成，
  //   若在这里也判为 incomplete，本地开发会被 503 挡住，得不偿失。
  // - 邮件配置本身也不是字段级必需项：`auth.requireEmailVerification: false` 时无邮件照常工作。
  //
  // 但有一组组合是**死锁**：要求邮箱验证却发不出验证邮件，新用户注册后永远无法登录。
  // 这是配置矛盾而非缺字段，因此单列一条带专属原因的诊断——沿用「缺少必要配置」会让
  // 运维去找一个其实存在、只是开关没开的字段。
  check(
    'auth',
    [],
    [],
    config.auth.requireEmailVerification && result.mail.state !== 'configured'
      ? [
          {
            key: 'mail.enabled',
            location: 'src/config/website.ts',
            conflict: true,
            reason:
              '要求邮箱验证但邮件未配置完整，新用户将永远无法登录；请补齐邮件配置，或显式设置 auth.requireEmailVerification: false',
          },
        ]
      : [],
  )

  return result
}

/**
 * 校验源码配置中无法由 TypeScript 类型守住的取值。
 *
 * 只产出字段名、原因与位置，绝不含原始值（避免把非法 URL / 邮箱写进日志）。
 * schema 层面的类型错误由 TypeScript 防守，这里不重复。
 */
export function validateWebsiteConfig(config: WebsiteConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const location = 'src/config/website.ts' as const

  for (const [platform, url] of Object.entries(config.social)) {
    if (url && !isSafeHttpsUrl(url)) {
      issues.push({
        key: `social.${platform}`,
        location,
        reason: '社交链接必须为无凭据的 HTTPS URL',
      })
    }
  }

  if (config.mail.supportEmail && !z.email().safeParse(config.mail.supportEmail).success) {
    issues.push({
      key: 'mail.supportEmail',
      location,
      reason: 'supportEmail 必须为合法邮箱地址',
    })
  }

  for (const [name, path] of Object.entries(config.metadata.images)) {
    if (!isRootOrProtocolRelativePath(path)) {
      issues.push({
        key: `metadata.images.${name}`,
        location,
        reason: '图片路径必须为 root-relative 或 protocol-relative',
      })
    }
  }

  // 配了 Price 但定价页上没有对应方案：用户永远买不到，而配置校验却是「完整」。
  for (const planId of findOrphanPlanIds(config.payment.priceMap)) {
    issues.push({
      key: `payment.priceMap.${planId}`,
      location,
      reason: '该 plan id 在定价页方案中不存在，配了 Price 也无法购买',
    })
  }

  return issues
}
