import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWebsiteConfig, websiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/core/env/public'
import { m } from '@/locale/paraglide/messages.js'

describe('websiteConfig 品牌信息', () => {
  it('站点名与 site_name 消息一致', () => {
    // 品牌名是配置项：`website.ts` 与 `messages/*.json` 各存一份，改一处不改另一处
    // 这里就会红。断言取相对值 —— 品牌改名（`pnpm run init` 之后就是改名）不用改测试。
    expect(websiteConfig.metadata.name).toBe(m.site_name({}, { locale: 'zh' }))
    expect(m.site_name({}, { locale: 'en' })).toBe(websiteConfig.metadata.name)
  })

  it('messages 中不残留模板占位品牌名 "SaaS Template"', () => {
    // 防止占位名在后续新增消息中回潮。
    for (const locale of ['zh', 'en'] as const) {
      const raw = readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf-8')
      expect(raw).not.toContain('SaaS Template')
    }
  })

  it('图片路径指向存在的品牌资产', () => {
    expect(websiteConfig.metadata.images).toEqual({
      ogImage: '/logo.png',
      logoLight: '/logo-horizontal-transparent.svg',
      logoDark: '/logo-horizontal-dark.svg',
      icon: '/icon-jerboa.svg',
    })
    for (const path of Object.values(websiteConfig.metadata.images)) {
      expect(existsSync(new URL(`../../public${path}`, import.meta.url))).toBe(true)
    }
  })

  it('显式公开 env 决定 baseUrl', () => {
    expect(createWebsiteConfig).toBeTypeOf('function')
    const config = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://acme.dev' }))
    expect(config.baseUrl).toBe('https://acme.dev')
  })

  it('配置里的固定项不随模块开关变化', () => {
    // 模块与能力的开关是部署场景的决定（各仓不同，`pnpm run init` 之后全关），
    // 这里只钉住与场景无关的固定项。
    const config = createWebsiteConfig(parsePublicEnv({}))
    expect(config.mail.provider).toBe('resend')
    expect(config.newsletter.provider).toBe('resend')
    expect(config.payment.provider).toBe('stripe')
    expect(config.notification.provider).toBe('discord')
    expect(config.analytics.providers).toEqual(['ga'])
    expect(config.auth.requireEmailVerification).toBe(true)
    expect(config.social).toEqual({})
    expect(config.ui).toEqual({
      defaultTheme: 'system',
      enableThemeSwitch: true,
      themeColor: { light: '#FCFAFF', dark: '#0A0A0F' },
    })
    expect(config.landingOffer).toEqual({ productId: 'template', offerId: 'once' })
  })

  it('每次工厂调用使用传入 env 并返回独立配置', () => {
    expect(createWebsiteConfig).toBeTypeOf('function')
    const declared = createWebsiteConfig(parsePublicEnv({}))
    const first = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://first.example' }))
    first.payment.enabled = false
    first.docs.enabled = false
    const second = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://second.example' }))
    expect(second.baseUrl).toBe('https://second.example')
    // 改一份不影响下一份：两次调用拿到的出厂值一样。
    expect(second.payment.enabled).toBe(declared.payment.enabled)
    expect(second.docs.enabled).toBe(declared.docs.enabled)
  })
})

/**
 * 环境变量覆盖模块与能力开关。
 *
 * 同一份代码要发到不同场景（文档站只开文档，业务站开支付与邮件），
 * 开关由 `VITE_MODULES` / `VITE_FEATURES` 覆盖。
 */
describe('环境变量覆盖模块与能力开关', () => {
  it('VITE_MODULES 只保留名单里的模块', () => {
    const config = createWebsiteConfig(parsePublicEnv({ VITE_MODULES: 'docs' }))
    expect(config.docs.enabled).toBe(true)
    // 白名单语义：不在名单里的模块一律关闭，与各仓默认值无关。
    expect(config.blog.enabled).toBe(false)
    expect(config.payment.enabled).toBe(false)
    expect(config.auth.enabled).toBe(false)
  })

  it('VITE_FEATURES 只保留名单里的能力开关', () => {
    const config = createWebsiteConfig(parsePublicEnv({ VITE_FEATURES: 'enableI18n' }))
    expect(config.features.enableI18n).toBe(true)
    expect(config.features.enableApiKeys).toBe(false)
    expect(config.features.enableAdmin).toBe(false)
  })

  it('覆盖模块开关时保留同一模块的其它字段', () => {
    const base = createWebsiteConfig(parsePublicEnv({}))
    const config = createWebsiteConfig(parsePublicEnv({ VITE_MODULES: 'docs' }))
    // 文档站地址不是开关，覆盖不能把它抹掉。
    expect(config.docs.siteUrl).toBe(base.docs.siteUrl)
    expect(config.mail.provider).toBe(base.mail.provider)
  })

  it('两个变量都缺省时沿用代码里的默认值', () => {
    const base = createWebsiteConfig(parsePublicEnv({}))
    const config = createWebsiteConfig(parsePublicEnv({}))
    expect(config.docs).toEqual(base.docs)
    expect(config.features).toEqual(base.features)
  })

  it('VITE_DOCS_AS_HOME 决定根路径是否进文档首页', () => {
    expect(createWebsiteConfig(parsePublicEnv({ VITE_DOCS_AS_HOME: 'true' })).docs.asHome).toBe(
      true,
    )
    expect(createWebsiteConfig(parsePublicEnv({ VITE_DOCS_AS_HOME: 'false' })).docs.asHome).toBe(
      false,
    )
    expect(createWebsiteConfig(parsePublicEnv({})).docs.asHome).toBeUndefined()
  })

  it('VITE_PAYMENT_PROVIDER 覆盖支付渠道，不影响其他支付字段', () => {
    const base = createWebsiteConfig(parsePublicEnv({}))
    const config = createWebsiteConfig(parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'creem' }))
    expect(config.payment.provider).toBe('creem')
    expect(config.payment.enabled).toBe(base.payment.enabled)
  })

  it('空值按「没给」处理，仍走代码里的默认值', () => {
    const base = createWebsiteConfig(parsePublicEnv({}))
    const config = createWebsiteConfig(parsePublicEnv({ VITE_MODULES: '' }))
    expect(config.docs).toEqual(base.docs)
    expect(config.payment.enabled).toBe(base.payment.enabled)
  })
})
