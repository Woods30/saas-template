import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  type InitConfig,
  MODULE_NAMES,
  setCheckoutMode,
  setFeatureEnabled,
  setModuleEnabled,
} from '../../scripts/init/plan'

/**
 * 模块开关的改写。
 *
 * 模板出厂时 docs / blog / changelog / mail / payment / analytics / auth 都是开的，
 * 而它们各自要求对应的 env 与外部服务：`auth.requireEmailVerification` 加上不完整的
 * mail 会让 `/api/auth/*` 返回 503，analytics 缺 `VITE_GA_ID` 会让生产校验直接失败。
 * 一个什么都不配的克隆者因此跑不通生产校验 —— init 默认把模块关掉，由开发者按需打开。
 */

const WEBSITE = `export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',
      logoAccent: 'x',
    },
    landingOffer: { productId: 'template', offerId: 'once' },
    docs: { enabled: true },
    blog: { enabled: true },
    changelog: { enabled: true },
    mail: { enabled: true, provider: 'resend', supportEmail: 'hi@example.test' },
    contact: { enabled: false },
    newsletter: { enabled: false, provider: 'resend' },
    payment: {
      // 当前站点启用 Stripe 收款；通知与分析待配置后单独开启。
      enabled: true,
      provider: 'stripe',
    },
    notification: { enabled: false, provider: 'discord' },
    analytics: { enabled: true, providers: ['ga'] },
    // 收款码链路：结账模式与模块开关成对出现，init 两个都要改写。
    checkout: { mode: 'provider' },
    collection: { enabled: false, verificationSlaHours: 24, accounts: [] },
    // auth 默认开启：模板自带登录 / 注册，关闭时对应页面与 API 一律 404。
    auth: { enabled: true, requireEmailVerification: true },
    social: {},
    features: {
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: true,
      enableAdmin: true,
      enableAIGateway: false,
    },
  }
}
`

const CONFIG: InitConfig = {
  name: 'Acme',
  slug: 'acme',
  domain: 'acme.dev',
  email: 'hi@acme.dev',
  modules: [],
}

/** 取出某个模块当前的 `enabled` 值，避免用整串匹配掩盖相邻改动。 */
function enabledOf(source: string, module: string): boolean | undefined {
  const match = new RegExp(`\\b${module}: \\{[^}]*?enabled: (true|false)`).exec(source)
  return match?.[1] === 'true'
}

describe('setModuleEnabled', () => {
  it('关闭单行模块', () => {
    expect(enabledOf(setModuleEnabled(WEBSITE, 'docs', false), 'docs')).toBe(false)
  })

  it('关闭多行模块（payment 中间带注释）', () => {
    expect(enabledOf(setModuleEnabled(WEBSITE, 'payment', false), 'payment')).toBe(false)
  })

  it('打开已关闭的模块', () => {
    expect(enabledOf(setModuleEnabled(WEBSITE, 'contact', true), 'contact')).toBe(true)
  })

  it('只改目标模块，其它模块与注释原样保留', () => {
    const result = setModuleEnabled(WEBSITE, 'docs', false)

    expect(enabledOf(result, 'blog')).toBe(true)
    expect(enabledOf(result, 'mail')).toBe(true)
    expect(result).toContain('// auth 默认开启')
    expect(result).toContain('// 当前站点启用 Stripe 收款')
  })

  it('幂等：重复关闭结果一致', () => {
    const once = setModuleEnabled(WEBSITE, 'docs', false)

    expect(setModuleEnabled(once, 'docs', false)).toBe(once)
  })
})

describe('setCheckoutMode', () => {
  it('切换结账模式', () => {
    expect(setCheckoutMode(WEBSITE, 'collection')).toContain("checkout: { mode: 'collection' }")
  })

  it('切回托管支付', () => {
    expect(setCheckoutMode(WEBSITE, 'provider')).toContain("checkout: { mode: 'provider' }")
  })

  it('找不到结账模式时报错', () => {
    expect(() => setCheckoutMode('const a = 1', 'collection')).toThrow(/结账模式/)
  })
})

describe('setFeatureEnabled', () => {
  it('关闭能力开关', () => {
    const result = setFeatureEnabled(WEBSITE, 'enableApiKeys', false)

    expect(result).toContain('enableApiKeys: false')
    expect(result).toContain('enableAdmin: true')
  })
})

describe('buildPlan 的模块默认值', () => {
  const file = buildPlan(CONFIG).files.find((entry) => entry.path === 'src/config/website.ts')
  const result = file?.transform(WEBSITE) ?? ''

  it('默认把全部内容模块关掉', () => {
    for (const module of MODULE_NAMES) expect(enabledOf(result, module)).toBe(false)
  })

  it('只打开配置里列出的模块', () => {
    const withDocs = buildPlan({ ...CONFIG, modules: ['docs', 'blog'] })
      .files.find((entry) => entry.path === 'src/config/website.ts')
      ?.transform(WEBSITE)

    expect(enabledOf(withDocs ?? '', 'docs')).toBe(true)
    expect(enabledOf(withDocs ?? '', 'blog')).toBe(true)
    expect(enabledOf(withDocs ?? '', 'payment')).toBe(false)
  })

  it('启用收款码模块时把结账模式切到 collection', () => {
    const withCollection = buildPlan({ ...CONFIG, modules: ['collection'] })
      .files.find((entry) => entry.path === 'src/config/website.ts')
      ?.transform(WEBSITE)

    expect(enabledOf(withCollection ?? '', 'collection')).toBe(true)
    expect(withCollection).toContain("checkout: { mode: 'collection' }")
  })

  it('不启用收款码模块时结账模式仍是 provider', () => {
    expect(result).toContain("checkout: { mode: 'provider' }")
  })

  it('关闭能力开关（api keys / admin）', () => {
    expect(result).toContain('enableApiKeys: false')
    expect(result).toContain('enableAdmin: false')
  })
})
