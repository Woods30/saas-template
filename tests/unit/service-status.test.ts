import { describe, expect, it } from 'vitest'
import { getMailFrom, getServiceStatuses, validateWebsiteConfig } from '@/config/service-status'
import { createWebsiteConfig, type WebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/core/env/public'
import { parseServerEnv as parseServerEnvRaw, type RuntimeEnv } from '@/core/env/server'
import { formatServiceDiagnostics } from '../../scripts/lib/report-issues'

/**
 * 构造运行期 env：启动参数用 `parseServerEnv` 的默认值，服务凭据（现在来自数据库
 * 配置）按用例显式给出。
 */
function makeServerEnv(extra: Record<string, string> = {}): RuntimeEnv {
  return { ...parseServerEnvRaw({}), ...extra } as RuntimeEnv
}

/**
 * 构造独立配置，避免用例之间互相污染。
 *
 * mail 的开关逐项写死：本文件测的是 `getServiceStatuses` 的分支逻辑，
 * 各仓的默认开关不同（可全关），依赖默认值会让用例无谓变红。
 */
function makeConfig(mutate?: (config: WebsiteConfig) => void): WebsiteConfig {
  const config = createWebsiteConfig(parsePublicEnv({}))
  config.mail.enabled = true
  mutate?.(config)
  return config
}

/**
 * 显式关闭全部服务模块的配置。本文件测的是 `getServiceStatuses` 的分支逻辑，
 * 开关随部署场景调整，依赖默认值会让用例无谓变红。
 */
function makeAllDisabledConfig(mutate?: (config: WebsiteConfig) => void): WebsiteConfig {
  const config = createWebsiteConfig(parsePublicEnv({}))
  config.mail.enabled = false
  config.contact.enabled = false
  config.newsletter.enabled = false
  config.payment.enabled = false
  config.notification.enabled = false
  config.analytics.enabled = false
  mutate?.(config)
  return config
}

// getMailFrom：provider 与 sender 归一化。
describe('getMailFrom', () => {
  it('优先返回 MAIL_FROM', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'resend'
    })
    const env = makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' })
    expect(getMailFrom(config, env)).toBe('noreply@jerbix.dev')
  })

  it('Resend 缺失 MAIL_FROM 时不借用 Cloudflare sender，也不回退 example.com', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'resend'
    })
    const env = makeServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' })
    expect(getMailFrom(config, env)).toBeUndefined()
  })

  it('Cloudflare 缺失 MAIL_FROM 时回退 CLOUDFLARE_EMAIL_SENDER', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'cloudflare'
    })
    const env = makeServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' })
    expect(getMailFrom(config, env)).toBe('cf@jerbix.dev')
  })

  it('Cloudflare 两者都缺失时返回 undefined', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'cloudflare'
    })
    expect(getMailFrom(config, makeServerEnv({}))).toBeUndefined()
  })
})

// mail 分支。
describe('getServiceStatuses — mail', () => {
  it('关闭时为 disabled 且不产出 issues（即便 secret 齐全）', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = false
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'synthetic-secret', MAIL_FROM: 'a@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('disabled')
    expect(statuses.mail.issues).toEqual([])
  })

  it('Resend 缺 sender 不能视为配置完整，且 issue 不含凭据值', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.map((i) => i.key)).toContain('MAIL_FROM')
    expect(JSON.stringify(statuses)).not.toContain('synthetic-secret')
  })

  it('Resend 缺 RESEND_API_KEY 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      serverEnv: makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.map((i) => i.key)).toContain('RESEND_API_KEY')
  })

  it('Resend 字段齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('configured')
    expect(statuses.mail.issues).toEqual([])
  })

  it('Cloudflare 运行时 binding 存在且 sender 齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.mail.provider = 'cloudflare'
      }),
      serverEnv: makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
      bindings: { email: true },
    })
    expect(statuses.mail.state).toBe('configured')
    expect(statuses.mail.issues).toEqual([])
  })

  it('CLI 无 bindings 时 Cloudflare 仅追加 manual 核对项，不判为 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.mail.provider = 'cloudflare'
      }),
      serverEnv: makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('configured')
    const manual = statuses.mail.issues.filter((i) => i.manual)
    expect(manual.map((i) => i.key)).toEqual(['EMAIL'])
    expect(manual[0]?.location).toBe('Cloudflare binding')
  })

  it('Cloudflare 运行时明确缺 binding 时为 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.mail.provider = 'cloudflare'
      }),
      serverEnv: makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
      bindings: { email: false },
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.map((i) => i.key)).toContain('EMAIL')
    expect(statuses.mail.issues.every((i) => !i.manual)).toBe(true)
  })

  it('Cloudflare 缺 sender 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.mail.provider = 'cloudflare'
      }),
      serverEnv: makeServerEnv({}),
      bindings: { email: true },
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.map((i) => i.key)).toContain('MAIL_FROM / CLOUDFLARE_EMAIL_SENDER')
  })

  it('Cloudflare 用 CLOUDFLARE_EMAIL_SENDER 即可满足 sender 要求', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.mail.provider = 'cloudflare'
      }),
      serverEnv: makeServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' }),
      bindings: { email: true },
    })
    expect(statuses.mail.state).toBe('configured')
  })
})

// 邮箱验证与邮件配置的矛盾：要求验证却发不出验证邮件是死锁。
describe('getServiceStatuses — 邮箱验证与邮件配置矛盾', () => {
  it('要求邮箱验证但邮件未配置完整时 mail 判为 incomplete 并标记 conflict', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.auth.requireEmailVerification = true
      }),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.find((i) => i.key === 'mail.enabled')?.conflict).toBe(true)
  })

  it('关闭邮箱验证且邮件齐全时 mail 为 configured，不报矛盾', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.auth.requireEmailVerification = false
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('configured')
    expect(statuses.mail.issues.some((i) => i.conflict)).toBe(false)
  })
})

// contact 分支。
describe('getServiceStatuses — contact', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeConfig(),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.contact.state).toBe('disabled')
  })

  it('mail 未配置完整时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.contact.enabled = true
        c.mail.enabled = true
        c.mail.supportEmail = 'support@jerbix.dev'
      }),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.contact.state).toBe('incomplete')
    expect(statuses.contact.issues.map((i) => i.key)).toContain('mail.enabled')
  })

  it('supportEmail 非法时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.contact.enabled = true
        c.mail.enabled = true
        c.mail.provider = 'resend'
        c.mail.supportEmail = 'not-an-email'
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.contact.state).toBe('incomplete')
    expect(statuses.contact.issues.map((i) => i.key)).toContain('mail.supportEmail')
  })

  it('mail 完整且 supportEmail 合法时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.contact.enabled = true
        c.mail.enabled = true
        c.mail.provider = 'resend'
        c.mail.supportEmail = 'support@jerbix.dev'
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.contact.state).toBe('configured')
    expect(statuses.contact.issues).toEqual([])
  })
})

// newsletter 分支。
describe('getServiceStatuses — newsletter', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeConfig(),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.newsletter.state).toBe('disabled')
  })

  it('Resend 缺 audience 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'resend'
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
    })
    expect(statuses.newsletter.state).toBe('incomplete')
    expect(statuses.newsletter.issues.map((i) => i.key)).toContain('RESEND_AUDIENCE_ID')
    expect(JSON.stringify(statuses)).not.toContain('synthetic-secret')
  })

  it('Resend 字段齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'resend'
      }),
      serverEnv: makeServerEnv({ RESEND_API_KEY: 'key', RESEND_AUDIENCE_ID: 'aud' }),
    })
    expect(statuses.newsletter.state).toBe('configured')
  })

  it('Beehiiv 缺 publication 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'beehiiv'
      }),
      serverEnv: makeServerEnv({ BEEHIIV_API_KEY: 'key' }),
    })
    expect(statuses.newsletter.state).toBe('incomplete')
    expect(statuses.newsletter.issues.map((i) => i.key)).toContain('BEEHIIV_PUBLICATION_ID')
  })

  it('Beehiiv 字段齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'beehiiv'
      }),
      serverEnv: makeServerEnv({ BEEHIIV_API_KEY: 'key', BEEHIIV_PUBLICATION_ID: 'pub' }),
    })
    expect(statuses.newsletter.state).toBe('configured')
  })
})

// payment 分支。
describe('getServiceStatuses — payment', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeAllDisabledConfig(),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.payment.state).toBe('disabled')
  })

  it('缺 webhook secret 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
      }),
      serverEnv: makeServerEnv({ STRIPE_SECRET_KEY: 'synthetic-secret' }),
    })
    expect(statuses.payment.state).toBe('incomplete')
    expect(statuses.payment.issues.map((i) => i.key)).toContain('STRIPE_WEBHOOK_SECRET')
    expect(JSON.stringify(statuses)).not.toContain('synthetic-secret')
  })

  it('价格锚点在产品配置里，网站配置补不了这一项', () => {
    // lookup_key 写在 `src/config/products.ts`，不在 website 配置里。
    // 配齐了产品配置就不该再报 `payment.products`。
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
      }),
      serverEnv: makeServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.issues.map((i) => i.key)).not.toContain('payment.products')
  })

  it('两个 secret 齐全且产品配置有效时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
      }),
      serverEnv: makeServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.state).toBe('configured')
  })

  it('首页要卖的商品没有价格引用时 incomplete', () => {
    // `websiteConfig.landingOffer` 是首页 CTA 指向的商品与购买方式。它没有价格引用时，
    // 首页取不到价格、结账也无从下手 —— 不能算「已配置」。
    // 声明了但没在 Stripe 上创建的 price，配置层看不出来，只能查「要卖的那个」。
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.landingOffer = { productId: 'free', offerId: 'once' }
      }),
      serverEnv: makeServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })

    expect(statuses.payment.state).toBe('incomplete')
    const issue = statuses.payment.issues.find((item) => item.key === 'payment.products')
    expect(issue?.reason).toContain('价格引用')
  })

  it('选 creem 时只校验 Creem 变量，Stripe 留空不影响', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.provider = 'creem'
      }),
      serverEnv: makeServerEnv({
        CREEM_API_KEY: 'key',
        CREEM_WEBHOOK_SECRET: 'whsec',
        CREEM_PRODUCTS: 'pro_monthly=prod_x',
      }),
    })
    expect(statuses.payment.state).toBe('configured')
    const keys = statuses.payment.issues.map((i) => i.key)
    expect(keys).not.toContain('STRIPE_SECRET_KEY')
    expect(keys).not.toContain('STRIPE_WEBHOOK_SECRET')
  })

  it('选 creem 但缺商品映射时 incomplete，并点名 CREEM_PRODUCTS', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.provider = 'creem'
      }),
      serverEnv: makeServerEnv({ CREEM_API_KEY: 'key', CREEM_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.state).toBe('incomplete')
    expect(statuses.payment.issues.map((i) => i.key)).toContain('CREEM_PRODUCTS')
  })

  it('选 creem 时配齐 Stripe 不算数', () => {
    // 配错渠道的密钥是常见错误：Stripe 全绿但 creem 选中的情况下仍是 incomplete。
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.provider = 'creem'
      }),
      serverEnv: makeServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.state).toBe('incomplete')
    expect(statuses.payment.issues.map((i) => i.key)).toContain('CREEM_API_KEY')
  })
})

// notification 分支。
describe('getServiceStatuses — notification', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeAllDisabledConfig(),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.notification.state).toBe('disabled')
  })

  it('无 webhook 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
      }),
      serverEnv: makeServerEnv({}),
    })
    expect(statuses.notification.state).toBe('incomplete')
    expect(statuses.notification.issues.map((i) => i.key)).toContain('DISCORD_WEBHOOK_URL')
  })

  it('仅 Discord webhook 时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
      }),
      serverEnv: makeServerEnv({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' }),
    })
    expect(statuses.notification.state).toBe('configured')
  })

  it('provider = feishu 且配了 Feishu webhook 时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
        c.notification.provider = 'feishu'
      }),
      serverEnv: makeServerEnv({
        FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
      }),
    })
    expect(statuses.notification.state).toBe('configured')
  })

  it('provider = feishu 但只配了 Discord webhook 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
        c.notification.provider = 'feishu'
      }),
      serverEnv: makeServerEnv({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' }),
    })
    expect(statuses.notification.state).toBe('incomplete')
    expect(statuses.notification.issues.map((i) => i.key)).toContain('FEISHU_WEBHOOK_URL')
  })
})

// analytics 分支：公开标识在数据库配置里，缺 ID 的渠道不注入脚本。
describe('getServiceStatuses — analytics', () => {
  function analyticsStatus(
    providers: WebsiteConfig['analytics']['providers'],
    config: WebsiteConfig['analytics']['config'],
    enabled = true,
  ) {
    return getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = enabled
        c.analytics.providers = providers
        c.analytics.config = config
      }),
      serverEnv: makeServerEnv(),
    })
  }

  it('关闭时为 disabled', () => {
    expect(analyticsStatus(['ga'], {}, false).analytics.state).toBe('disabled')
  })

  it('启用但未选择 provider 时 incomplete', () => {
    const statuses = analyticsStatus([], {})
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('analytics.providers')
  })

  it('GA 缺 ID 时 incomplete', () => {
    const statuses = analyticsStatus(['ga'], {})
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('analytics.gaId')
  })

  it('Plausible 缺域名时 incomplete', () => {
    const statuses = analyticsStatus(['plausible'], {})
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('analytics.plausibleDomain')
  })

  it('Umami 缺 ID 与脚本 URL 时列出两项要求', () => {
    const statuses = analyticsStatus(['umami'], {})
    expect(statuses.analytics.state).toBe('incomplete')
    const keys = statuses.analytics.issues.map((i) => i.key)
    expect(keys).toContain('analytics.umamiWebsiteId')
    expect(keys).toContain('analytics.umamiScriptUrl')
  })

  it('Umami 有 ID 但缺脚本 URL 时仍 incomplete', () => {
    const statuses = analyticsStatus(['umami'], { umamiWebsiteId: 'site-1' })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toEqual(['analytics.umamiScriptUrl'])
  })

  it('Clarity 缺 project id 时 incomplete', () => {
    const statuses = analyticsStatus(['clarity'], {})
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('analytics.clarityProjectId')
  })

  it('选中的每个 provider 都完整时 configured', () => {
    const statuses = analyticsStatus(['ga', 'plausible', 'umami', 'clarity'], {
      gaId: 'G-XXX',
      plausibleDomain: 'jerbix.dev',
      umamiWebsiteId: 'site-1',
      umamiScriptUrl: 'https://stats.jerbix.dev/script.js',
      clarityProjectId: 'clarity-1',
    })
    expect(statuses.analytics.state).toBe('configured')
    expect(statuses.analytics.issues).toEqual([])
  })

  it('缺字段的 issue 标注为数据库配置', () => {
    const statuses = analyticsStatus(['ga'], {})
    expect(statuses.analytics.issues[0]?.location).toBe('数据库配置')
  })
})

// 凭据不外泄。
describe('getServiceStatuses — 凭据不外泄', () => {
  it('序列化结果不含任何合成 secret 值', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
        c.contact.enabled = true
        c.newsletter.enabled = true
        c.payment.enabled = true
        c.notification.enabled = true
        c.analytics.enabled = true
        c.analytics.providers = ['ga']
      }),
      serverEnv: makeServerEnv({
        RESEND_API_KEY: 'synthetic-resend-key',
        STRIPE_SECRET_KEY: 'synthetic-stripe-key',
        STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret',
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/999/synthetic-discord-token',
      }),
    })
    const serialized = JSON.stringify(statuses)
    expect(serialized).not.toContain('synthetic-resend-key')
    expect(serialized).not.toContain('synthetic-stripe-key')
    expect(serialized).not.toContain('synthetic-webhook-secret')
    expect(serialized).not.toContain('synthetic-discord-token')
    for (const status of Object.values(statuses)) {
      for (const issue of status.issues) {
        expect(Object.keys(issue).sort()).toEqual(
          expect.arrayContaining(['key', 'location', 'reason']),
        )
      }
    }
  })
})

// 完整配置判断（数据驱动）：字段齐全为 configured，缺一为 incomplete，关闭恒为 disabled。
describe('getServiceStatuses — 完整配置判断（数据驱动）', () => {
  type Case = {
    name: string
    mutate: (config: WebsiteConfig) => void
    completeEnv: Record<string, string>
    /** 补齐配置侧字段（凭据之外的标识）。 */
    completeConfig?: (config: WebsiteConfig) => void
  }

  const cases: Case[] = [
    {
      name: 'mail（Resend）',
      mutate: (c) => {
        c.mail.enabled = true
      },
      completeEnv: { RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' },
    },
    {
      name: 'newsletter（Resend）',
      mutate: (c) => {
        c.newsletter.enabled = true
      },
      completeEnv: { RESEND_API_KEY: 'key', RESEND_AUDIENCE_ID: 'aud' },
    },
    {
      name: 'payment（Stripe）',
      mutate: (c) => {
        c.payment.enabled = true
      },
      completeEnv: { STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' },
    },
    {
      name: 'notification',
      mutate: (c) => {
        c.notification.enabled = true
      },
      completeEnv: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' },
    },
    {
      name: 'analytics（GA）',
      mutate: (c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['ga']
      },
      completeEnv: {},
      completeConfig: (c) => {
        c.analytics.config = { gaId: 'G-XXX' }
      },
    },
    {
      name: 'contact',
      mutate: (c) => {
        c.contact.enabled = true
        c.mail.enabled = true
        c.mail.supportEmail = 'support@jerbix.dev'
      },
      completeEnv: { RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' },
    },
  ]

  it.each(cases)('$name：关闭 disabled / 缺字段 incomplete / 齐全 configured', (testCase) => {
    const moduleName = testCase.name.split('（')[0] as keyof ReturnType<typeof getServiceStatuses>

    // 关闭时：即便字段齐全也 disabled。
    const disabled = getServiceStatuses({
      config: makeAllDisabledConfig(),
      serverEnv: makeServerEnv(testCase.completeEnv),
    })
    expect(disabled[moduleName].state).toBe('disabled')

    // 启用但缺字段。
    const incomplete = getServiceStatuses({
      config: makeConfig(testCase.mutate),
      serverEnv: makeServerEnv({}),
    })
    expect(incomplete[moduleName].state).toBe('incomplete')

    // 启用且字段齐全。
    const configured = getServiceStatuses({
      config: makeConfig((config) => {
        testCase.mutate(config)
        testCase.completeConfig?.(config)
      }),
      serverEnv: makeServerEnv(testCase.completeEnv),
    })
    expect(configured[moduleName].state).toBe('configured')
  })
})

// formatServiceDiagnostics：CLI 共享诊断输出。
describe('formatServiceDiagnostics', () => {
  const statusesOf = (input: Parameters<typeof getServiceStatuses>[0]) => getServiceStatuses(input)

  it('逐模块输出状态标签，且已启用缺字段时 hasIncomplete 为真', () => {
    const result = formatServiceDiagnostics(
      statusesOf({
        config: makeConfig((c) => {
          c.mail.enabled = true
        }),
        serverEnv: makeServerEnv({}),
      }),
    )
    expect(result.hasIncomplete).toBe(true)
    const text = result.lines.join('\n')
    expect(text).toContain('mail')
    expect(text).toContain('配置不完整')
    expect(text).toContain('RESEND_API_KEY')
    expect(text).toContain('MAIL_FROM')
  })

  it('全部关闭时不产生 incomplete，且不输出任何字段值', () => {
    const result = formatServiceDiagnostics(
      statusesOf({
        config: makeAllDisabledConfig(),
        serverEnv: makeServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
      }),
    )
    expect(result.hasIncomplete).toBe(false)
    expect(result.lines.join('\n')).not.toContain('synthetic-secret')
  })

  it('manual 项标注「部署核对」且不计入 incomplete', () => {
    const result = formatServiceDiagnostics(
      statusesOf({
        config: makeAllDisabledConfig((c) => {
          c.mail.enabled = true
          c.mail.provider = 'cloudflare'
        }),
        serverEnv: makeServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
      }),
    )
    expect(result.hasIncomplete).toBe(false)
    expect(result.lines.join('\n')).toContain('部署核对')
  })

  it('配置齐全时 configured 且不含 secret 值', () => {
    const result = formatServiceDiagnostics(
      statusesOf({
        config: makeAllDisabledConfig((c) => {
          c.payment.enabled = true
        }),
        serverEnv: makeServerEnv({
          STRIPE_SECRET_KEY: 'synthetic-stripe-key',
          STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret',
        }),
      }),
    )
    expect(result.hasIncomplete).toBe(false)
    const text = result.lines.join('\n')
    expect(text).toContain('payment')
    expect(text).toContain('已配置')
    expect(text).not.toContain('synthetic-stripe-key')
    expect(text).not.toContain('synthetic-webhook-secret')
  })
})

// validateWebsiteConfig。
describe('validateWebsiteConfig', () => {
  it('默认配置无 issues', () => {
    expect(validateWebsiteConfig(makeConfig())).toEqual([])
  })

  it('非空非法社交 URL 产生只含字段名的 issue', () => {
    const issues = validateWebsiteConfig(
      makeConfig((c) => {
        c.social = { github: 'javascript:alert(1)' }
      }),
    )
    expect(issues.map((i) => i.key)).toContain('social.github')
    expect(issues.every((i) => i.location === 'src/config/website.ts')).toBe(true)
    expect(JSON.stringify(issues)).not.toContain('javascript:alert(1)')
  })

  it('空的社交值与 supportEmail 不产生 issue', () => {
    const issues = validateWebsiteConfig(
      makeConfig((c) => {
        c.social = { github: '' }
        c.mail.supportEmail = ''
      }),
    )
    expect(issues).toEqual([])
  })

  it('非空非法 supportEmail 产生 issue', () => {
    const issues = validateWebsiteConfig(
      makeConfig((c) => {
        c.mail.supportEmail = 'not-an-email'
      }),
    )
    expect(issues.map((i) => i.key)).toContain('mail.supportEmail')
  })

  it('非 root-relative / protocol-relative 图片路径产生 issue', () => {
    const issues = validateWebsiteConfig(
      makeConfig((c) => {
        c.metadata.images.logoLight = 'logo.png'
      }),
    )
    expect(issues.map((i) => i.key)).toContain('metadata.images.logoLight')
  })

  it('接受 root-relative 与 protocol-relative 图片路径', () => {
    const issues = validateWebsiteConfig(
      makeConfig((c) => {
        c.metadata.images.logoLight = '/logo.svg'
        c.metadata.images.logoDark = '//cdn.jerbix.dev/logo.svg'
      }),
    )
    expect(issues).toEqual([])
  })
})
