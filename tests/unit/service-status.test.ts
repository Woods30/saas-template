import { describe, expect, it } from 'vitest'
import { getMailFrom, getServiceStatuses, validateWebsiteConfig } from '@/config/service-status'
import { createWebsiteConfig, type WebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import { parseServerEnv } from '@/env/server'
import { formatServiceDiagnostics } from '../../scripts/lib/report-issues'

/** 构造独立配置，避免用例之间互相污染。 */
function makeConfig(mutate?: (config: WebsiteConfig) => void): WebsiteConfig {
  const config = createWebsiteConfig(parsePublicEnv({}))
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
    const env = parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' })
    expect(getMailFrom(config, env)).toBe('noreply@jerbix.dev')
  })

  it('Resend 缺失 MAIL_FROM 时不借用 Cloudflare sender，也不回退 example.com', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'resend'
    })
    const env = parseServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' })
    expect(getMailFrom(config, env)).toBeUndefined()
  })

  it('Cloudflare 缺失 MAIL_FROM 时回退 CLOUDFLARE_EMAIL_SENDER', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'cloudflare'
    })
    const env = parseServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' })
    expect(getMailFrom(config, env)).toBe('cf@jerbix.dev')
  })

  it('Cloudflare 两者都缺失时返回 undefined', () => {
    const config = makeConfig((c) => {
      c.mail.provider = 'cloudflare'
    })
    expect(getMailFrom(config, parseServerEnv({}))).toBeUndefined()
  })
})

// mail 分支。
describe('getServiceStatuses — mail', () => {
  it('关闭时为 disabled 且不产出 issues（即便 secret 齐全）', () => {
    const statuses = getServiceStatuses({
      config: makeConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'synthetic-secret', MAIL_FROM: 'a@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('disabled')
    expect(statuses.mail.issues).toEqual([])
  })

  it('Resend 缺 sender 不能视为配置完整，且 issue 不含凭据值', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.mail.state).toBe('incomplete')
    expect(statuses.mail.issues.map((i) => i.key)).toContain('RESEND_API_KEY')
  })

  it('Resend 字段齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ CLOUDFLARE_EMAIL_SENDER: 'cf@jerbix.dev' }),
      bindings: { email: true },
    })
    expect(statuses.mail.state).toBe('configured')
  })
})

// contact 分支。
describe('getServiceStatuses — contact', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.newsletter.state).toBe('disabled')
  })

  it('Resend 缺 audience 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'resend'
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'key', RESEND_AUDIENCE_ID: 'aud' }),
    })
    expect(statuses.newsletter.state).toBe('configured')
  })

  it('Beehiiv 缺 publication 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.newsletter.enabled = true
        c.newsletter.provider = 'beehiiv'
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ BEEHIIV_API_KEY: 'key' }),
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ BEEHIIV_API_KEY: 'key', BEEHIIV_PUBLICATION_ID: 'pub' }),
    })
    expect(statuses.newsletter.state).toBe('configured')
  })
})

// payment 分支。
describe('getServiceStatuses — payment', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeAllDisabledConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.payment.state).toBe('disabled')
  })

  it('缺 webhook secret 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.lookupKeyMap = { pro_monthly: { month: 'pro_monthly' } }
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ STRIPE_SECRET_KEY: 'synthetic-secret' }),
    })
    expect(statuses.payment.state).toBe('incomplete')
    expect(statuses.payment.issues.map((i) => i.key)).toContain('STRIPE_WEBHOOK_SECRET')
    expect(JSON.stringify(statuses)).not.toContain('synthetic-secret')
  })

  it('lookup key 为空或全为空白时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.lookupKeyMap = { pro_monthly: { month: '   ' } }
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.state).toBe('incomplete')
    expect(statuses.payment.issues.map((i) => i.key)).toContain('payment.lookupKeyMap')
  })

  it('两个 secret 与非空 price id 齐全时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.payment.enabled = true
        c.payment.lookupKeyMap = { pro_monthly: { month: 'pro_monthly' } }
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' }),
    })
    expect(statuses.payment.state).toBe('configured')
  })
})

// notification 分支。
describe('getServiceStatuses — notification', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeAllDisabledConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.notification.state).toBe('disabled')
  })

  it('无 webhook 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.notification.state).toBe('incomplete')
    expect(statuses.notification.issues.map((i) => i.key)).toContain('DISCORD_WEBHOOK_URL')
  })

  it('仅 Discord webhook 时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' }),
    })
    expect(statuses.notification.state).toBe('configured')
  })

  it('provider = feishu 且配了 Feishu webhook 时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.notification.enabled = true
        c.notification.provider = 'feishu'
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' }),
    })
    expect(statuses.notification.state).toBe('incomplete')
    expect(statuses.notification.issues.map((i) => i.key)).toContain('FEISHU_WEBHOOK_URL')
  })
})

// analytics 分支。
describe('getServiceStatuses — analytics', () => {
  it('关闭时为 disabled', () => {
    const statuses = getServiceStatuses({
      config: makeAllDisabledConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('disabled')
  })

  it('启用但未选择 provider 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        // 默认已选中 ga，本用例验证「选中为空」这一分支。
        c.analytics.providers = []
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('analytics.providers')
  })

  it('GA 缺 VITE_GA_ID 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['ga']
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('VITE_GA_ID')
  })

  it('Plausible 缺 VITE_PLAUSIBLE_DOMAIN 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['plausible']
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain('VITE_PLAUSIBLE_DOMAIN')
  })

  it('Umami 缺 ID 与脚本 URL 时列出两项要求', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['umami']
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    const keys = statuses.analytics.issues.map((i) => i.key)
    expect(keys).toContain('VITE_UMAMI_WEBSITE_ID / VITE_UMAMI_ID')
    expect(keys).toContain('VITE_UMAMI_SCRIPT_URL')
  })

  it('Umami 有 ID 但缺脚本 URL 时仍 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['umami']
      }),
      publicEnv: parsePublicEnv({ VITE_UMAMI_WEBSITE_ID: 'site-1' }),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toEqual(['VITE_UMAMI_SCRIPT_URL'])
  })

  it('Umami 使用 legacy VITE_UMAMI_ID 亦可满足 ID 要求', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['umami']
      }),
      publicEnv: parsePublicEnv({
        VITE_UMAMI_ID: 'legacy-1',
        VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
      }),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('configured')
  })

  it('Clarity 缺 project id 时 incomplete', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['clarity']
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('incomplete')
    expect(statuses.analytics.issues.map((i) => i.key)).toContain(
      'VITE_CLARITY_PROJECT_ID / VITE_CLARITY_ID',
    )
  })

  it('选中的每个 provider 都完整时 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['ga', 'plausible', 'umami', 'clarity']
      }),
      publicEnv: parsePublicEnv({
        VITE_GA_ID: 'G-XXX',
        VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev',
        VITE_UMAMI_WEBSITE_ID: 'site-1',
        VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
        VITE_CLARITY_PROJECT_ID: 'clarity-1',
      }),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.analytics.state).toBe('configured')
    expect(statuses.analytics.issues).toEqual([])
  })
})

// auth 分支。
describe('getServiceStatuses — auth', () => {
  it('默认（不要求验证 + 邮件未配置）为 configured：开箱即用的注册登录必须可用', () => {
    const statuses = getServiceStatuses({
      config: makeConfig(),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.auth.state).toBe('configured')
  })

  it('显式要求验证但邮件未配置时判为 incomplete：否则新用户永远无法登录', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.auth.requireEmailVerification = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.auth.state).toBe('incomplete')
    expect(statuses.auth.issues.map((i) => i.key)).toContain('mail.enabled')
  })

  it('要求验证且邮件配置齐全时为 configured', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.mail.enabled = true
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' }),
    })
    expect(statuses.auth.state).toBe('configured')
  })

  it('关闭邮箱验证时不依赖邮件配置（无邮件部署的唯一放行方式）', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.auth.requireEmailVerification = false
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.auth.state).toBe('configured')
  })

  it('auth 关闭时不受该组合约束', () => {
    const statuses = getServiceStatuses({
      config: makeConfig((c) => {
        c.auth.enabled = false
      }),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.auth.state).toBe('disabled')
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
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({
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
    completePublic: Record<string, string>
  }

  const cases: Case[] = [
    {
      name: 'mail（Resend）',
      mutate: (c) => {
        c.mail.enabled = true
      },
      completeEnv: { RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' },
      completePublic: {},
    },
    {
      name: 'newsletter（Resend）',
      mutate: (c) => {
        c.newsletter.enabled = true
      },
      completeEnv: { RESEND_API_KEY: 'key', RESEND_AUDIENCE_ID: 'aud' },
      completePublic: {},
    },
    {
      name: 'payment（Stripe）',
      mutate: (c) => {
        c.payment.enabled = true
        c.payment.lookupKeyMap = { pro_monthly: { month: 'pro_monthly' } }
      },
      completeEnv: { STRIPE_SECRET_KEY: 'key', STRIPE_WEBHOOK_SECRET: 'whsec' },
      completePublic: {},
    },
    {
      name: 'notification',
      mutate: (c) => {
        c.notification.enabled = true
      },
      completeEnv: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' },
      completePublic: {},
    },
    {
      name: 'analytics（GA）',
      mutate: (c) => {
        c.analytics.enabled = true
        c.analytics.providers = ['ga']
      },
      completeEnv: {},
      completePublic: { VITE_GA_ID: 'G-XXX' },
    },
    {
      name: 'contact',
      mutate: (c) => {
        c.contact.enabled = true
        c.mail.enabled = true
        c.mail.supportEmail = 'support@jerbix.dev'
      },
      completeEnv: { RESEND_API_KEY: 'key', MAIL_FROM: 'noreply@jerbix.dev' },
      completePublic: {},
    },
  ]

  it.each(cases)('$name：关闭 disabled / 缺字段 incomplete / 齐全 configured', (testCase) => {
    const moduleName = testCase.name.split('（')[0] as keyof ReturnType<typeof getServiceStatuses>

    // 关闭时：即便字段齐全也 disabled。
    const disabled = getServiceStatuses({
      config: makeAllDisabledConfig(),
      publicEnv: parsePublicEnv(testCase.completePublic),
      serverEnv: parseServerEnv(testCase.completeEnv),
    })
    expect(disabled[moduleName].state).toBe('disabled')

    // 启用但缺字段。
    const incomplete = getServiceStatuses({
      config: makeConfig(testCase.mutate),
      publicEnv: parsePublicEnv({}),
      serverEnv: parseServerEnv({}),
    })
    expect(incomplete[moduleName].state).toBe('incomplete')

    // 启用且字段齐全。
    const configured = getServiceStatuses({
      config: makeConfig(testCase.mutate),
      publicEnv: parsePublicEnv(testCase.completePublic),
      serverEnv: parseServerEnv(testCase.completeEnv),
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
        publicEnv: parsePublicEnv({}),
        serverEnv: parseServerEnv({}),
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
        // auth 默认要求邮箱验证，缺 mail 时必然 incomplete；本用例只验证无 incomplete
        // 时的输出与脱敏，故关掉验证。
        config: makeAllDisabledConfig((c) => {
          c.auth.requireEmailVerification = false
        }),
        publicEnv: parsePublicEnv({}),
        serverEnv: parseServerEnv({ RESEND_API_KEY: 'synthetic-secret' }),
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
        publicEnv: parsePublicEnv({}),
        serverEnv: parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }),
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
          c.payment.lookupKeyMap = { pro_monthly: { month: 'pro_monthly' } }
          // 同上：只验证齐全时 configured 且不泄漏 secret，故关掉邮箱验证。
          c.auth.requireEmailVerification = false
        }),
        publicEnv: parsePublicEnv({}),
        serverEnv: parseServerEnv({
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
