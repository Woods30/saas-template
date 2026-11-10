import { z } from 'zod'
import { resolveCollectionPrice } from '@/collection/pricing'
import type { PublicEnv } from '@/env/public'
import type { ServerEnv } from '@/env/server'
import { productConfigErrors, resolvePriceReference } from './products'
import type { ServiceModule, WebsiteConfig } from './website'

/**
 * 服务配置诊断。
 *
 * 纯函数：不发起网络请求、不读取 env、不回显凭据值，env 与 binding 由调用方传入。
 * 状态只表示「开关与必要字段是否齐备」，**不代表**外部服务 ready 或投递成功。
 */
export type ConfigIssue = {
  key: string
  reason: string
  location: 'src/config/website.ts' | 'src/config/products.ts' | 'env' | 'Cloudflare binding'
  manual?: boolean
  /** 配置矛盾（字段存在但取值互斥），而非字段缺失。仅影响诊断文案的分组标签。 */
  conflict?: boolean
}

export type ServiceStatus = {
  state: 'disabled' | 'incomplete' | 'configured'
  issues: ConfigIssue[]
}

/**
 * 归一化默认发件人：优先 `MAIL_FROM`，Cloudflare provider 再回退 `CLOUDFLARE_EMAIL_SENDER`。
 *
 * 不回退 `example.com`，缺失即返回 `undefined`，对应 provider 因此不注册。
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
  return value.startsWith('/')
}

export function getServiceStatuses(input: {
  config: WebsiteConfig
  publicEnv: PublicEnv
  serverEnv: ServerEnv
  bindings?: { email: boolean }
}): Record<ServiceModule, ServiceStatus> {
  const { config, publicEnv: pub, serverEnv: env, bindings } = input
  // 受控断言：每个 ServiceModule 键都会被 `check` 赋值后才返回。
  const result = {} as Record<ServiceModule, ServiceStatus>
  const check = (
    name: ServiceModule,
    // 每项是「键名 / 是否齐备 / 位置 / 原因」；原因缺省时用通用的「缺少必要配置」。
    requirements: Array<[string, boolean, ConfigIssue['location'], string?]>,
    manualIssues: ConfigIssue[] = [],
    // 与 manualIssues 不同：这些**计入** completeness 判定，用于表达字段存在但取值互斥。
    conflictIssues: ConfigIssue[] = [],
  ) => {
    const issues = config[name].enabled
      ? requirements
          .filter(([, valid]) => !valid)
          .map(([key, , location, reason]) => ({
            key,
            location,
            reason: reason ?? REQUIRED_CONFIG_REASON,
          }))
      : []
    result[name] = {
      state: !config[name].enabled
        ? 'disabled'
        : issues.length + conflictIssues.length
          ? 'incomplete'
          : 'configured',
      // manual 核对项仅用于部署提示，不参与 completeness 判定。
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

  // 只校验当前选中渠道的密钥：配了 Stripe 却选 creem 仍是 incomplete。
  const paymentEnvChecks: Array<[string, boolean, ConfigIssue['location'], string?]> =
    config.payment.provider === 'creem'
      ? [
          ['CREEM_API_KEY', !!env.CREEM_API_KEY, 'env'],
          ['CREEM_WEBHOOK_SECRET', !!env.CREEM_WEBHOOK_SECRET, 'env'],
          [
            'CREEM_PRODUCTS',
            !!env.CREEM_PRODUCTS,
            'env',
            'Creem 的商品 ID 映射（reference=prod_xxx）',
          ],
        ]
      : [
          ['STRIPE_SECRET_KEY', !!env.STRIPE_SECRET_KEY, 'env'],
          ['STRIPE_WEBHOOK_SECRET', !!env.STRIPE_WEBHOOK_SECRET, 'env'],
        ]

  check(
    'payment',
    [
      ...paymentEnvChecks,
      // 首页 CTA 指向的那个商品与购买方式必须有价格引用，否则首页取不到价格、
      // 结账也无从下手。查「所有已声明的引用」没有意义：声明过的引用未必在
      // 支付渠道上真的建过价格，那种情况在配置层看不出来。
      [
        'payment.products',
        resolvePriceReference(config.landingOffer.productId, config.landingOffer.offerId) !==
          undefined,
        'src/config/products.ts',
        '首页要卖的商品没有对应的价格引用（价格未创建或引用已迁移）',
      ],
    ],
    [],
    // 重复产品 ID 或价格引用会让价格归属判定出错，
    // 属于「配置矛盾」：字段都在，但组合起来是错的。
    validateProductConfig(),
  )

  // 核销型支付与 provider 托管支付互不依赖，各自独立判定。
  // 完整性只看三件事：目标商品有没有本地标价、有没有可用收款账户、
  // 以及结账模式与模块开关是否一致（二维码存不存对象存储不影响完整性）。
  const collectionAccounts = config.collection.accounts
  const collectionAccountIds = new Set<string>()
  const collectionAccountDuplicates: ConfigIssue[] = []
  for (const account of collectionAccounts) {
    if (collectionAccountIds.has(account.id)) {
      collectionAccountDuplicates.push({
        key: 'collection.accounts',
        location: 'src/config/website.ts',
        conflict: true,
        reason: `收款账户 ID ${account.id} 重复，账户解析会取到不确定的那一个`,
      })
    }
    collectionAccountIds.add(account.id)
  }
  const collectionQrIssues: ConfigIssue[] = collectionAccounts
    .filter(
      (account) =>
        !isRootOrProtocolRelativePath(account.qrImageUrl) && !isSafeHttpsUrl(account.qrImageUrl),
    )
    .map((account) => ({
      key: 'collection.accounts',
      location: 'src/config/website.ts',
      conflict: true,
      reason: `收款账户 ${account.id} 的收款码地址必须是站内根路径或无凭据的 HTTPS 地址`,
    }))

  check(
    'collection',
    [
      [
        'collection.products',
        resolveCollectionPrice(config.landingOffer.productId, config.landingOffer.offerId) !==
          undefined,
        'src/config/products.ts',
        '首页要卖的商品没有核销型本地标价（收款码链路收不了单）',
      ],
      [
        'collection.accounts',
        collectionAccounts.length > 0,
        'src/config/website.ts',
        '没有可用的收款账户，用户付款后无处可付',
      ],
    ],
    [],
    [
      ...collectionAccountDuplicates,
      ...collectionQrIssues,
      // 结账模式选了核销型但模块没开（或反过来）：配置互相矛盾，
      // 用户要么看不到购买入口，要么点了进不去。
      ...(config.checkout.mode === 'collection' && !config.collection.enabled
        ? [
            {
              key: 'checkout.mode',
              location: 'src/config/website.ts' as const,
              conflict: true,
              reason:
                '结账模式是 collection 但核销型支付模块未启用；请启用该模块，或把结账模式改回 provider',
            },
          ]
        : []),
    ],
  )

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

  // auth 没有运行期必需的 env：secret 缺失时 better-auth 退回开发期密钥，
  // 生产环境由 `validateProdServerEnv` 在部署前校验。
  // 唯一的死锁组合是「要求邮箱验证却发不出验证邮件」，故单列一条配置矛盾诊断。
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

  return issues
}

/** 校验套餐 ID 与销售引用，避免空值或重复配置导致归属不明确。 */
export function validateProductConfig(): ConfigIssue[] {
  return productConfigErrors().map((error) => ({
    key: `payment.products.${error}`,
    location: 'src/config/products.ts' as const,
    reason: '套餐 ID、价格引用重复或为空，请检查套餐配置',
  }))
}
