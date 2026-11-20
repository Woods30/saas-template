import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWebsiteConfig, websiteConfig } from '@/config/website'
import { defaultSettingsValues } from '@/core/config/registry'
import { parsePublicEnv } from '@/core/env/public'
import { m } from '@/locale/paraglide/messages.js'

describe('websiteConfig 品牌信息', () => {
  it('站点名与 site_name 消息一致', () => {
    // 品牌名是配置项：`website.ts` 与 `messages/*.json` 各存一份，改一处不改另一处
    // 这里就会红。断言取相对值 —— 品牌改名（改过配置就是改名）不用改测试。
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
    // 模块与能力的开关是部署场景的决定（各仓不同，可全关），
    // 这里只钉住与场景无关的固定项。
    const config = createWebsiteConfig(parsePublicEnv({}))
    expect(config.mail.provider).toBe('resend')
    expect(config.newsletter.provider).toBe('resend')
    expect(config.payment.provider).toBe('stripe')
    expect(config.notification.provider).toBe('discord')
    expect(config.analytics.providers).toEqual(['ga'])
    expect(config.auth.requireEmailVerification).toBe(false)
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
 * 模块与能力开关不再由环境变量覆盖：出厂值来自配置注册表，运行期以数据库配置为准。
 * 这里只钉住「工厂默认输出 = 注册表默认值」这一条，避免两份默认值漂移。
 */
describe('出厂值来自配置注册表', () => {
  it('未写数据库时，工厂输出等于注册表默认值', () => {
    const config = createWebsiteConfig(parsePublicEnv({}))
    const defaults = defaultSettingsValues()
    expect(config.docs.enabled).toBe(defaults['modules.docs'])
    expect(config.blog.enabled).toBe(defaults['modules.blog'])
    expect(config.payment.enabled).toBe(defaults['modules.payment'])
    // 能力开关（`features.*`）已整体移除：站点配置里不再有这一层。
    expect('features' in config).toBe(false)
  })

  it('工厂调用之间互不影响', () => {
    const first = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://first.example' }))
    first.docs.enabled = !first.docs.enabled
    const second = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://second.example' }))
    expect(second.docs.enabled).toBe(createWebsiteConfig(parsePublicEnv({})).docs.enabled)
  })
})
