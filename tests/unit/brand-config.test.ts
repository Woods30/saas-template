import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWebsiteConfig, websiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import { m } from '@/locale/paraglide/messages.js'

describe('websiteConfig 品牌信息', () => {
  it('站点名为 Jerbix', () => {
    expect(websiteConfig.metadata.name).toBe('Jerbix')
  })

  it('site_name 消息在两种语言下都解析为 Jerbix', () => {
    // `<title>` 取自 site_name，须与 Navbar / footer / manifest 一致。
    expect(m.site_name({}, { locale: 'zh' })).toBe('Jerbix')
    expect(m.site_name({}, { locale: 'en' })).toBe('Jerbix')
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

  it('显式公开 env 决定 baseUrl，默认只开启已有内容模块', () => {
    expect(createWebsiteConfig).toBeTypeOf('function')
    const config = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
    expect(config.baseUrl).toBe('https://jerbix.dev')
    expect(config.docs.enabled).toBe(true)
    expect(config.blog.enabled).toBe(true)
    expect(config.changelog.enabled).toBe(true)
    expect(config.mail).toEqual({ enabled: false, provider: 'resend', supportEmail: '' })
    expect(config.contact.enabled).toBe(false)
    expect(config.newsletter).toEqual({ enabled: false, provider: 'resend' })
    // 服务模块开关是部署场景的决定，断言跟着当前默认值走。
    // 价格锚点（lookup_key）在 `src/config/products.ts` 里，不在 website 配置里。
    expect(config.payment).toEqual({
      enabled: true,
      provider: 'stripe',
    })
    expect(config.notification).toEqual({ enabled: true, provider: 'discord' })
    expect(config.analytics).toEqual({ enabled: true, providers: ['ga'] })
    expect(config.social).toEqual({})
    expect(config.ui).toEqual({
      defaultTheme: 'system',
      enableThemeSwitch: true,
      themeColor: { light: '#FCFAFF', dark: '#0A0A0F' },
    })
    expect(config.features).toEqual({
      enableI18n: true,
      enableFileUpload: false,
      enableApiKeys: true,
      enableAdmin: true,
      enableAIGateway: false,
    })
  })

  it('每次工厂调用使用传入 env 并返回独立配置', () => {
    expect(createWebsiteConfig).toBeTypeOf('function')
    const first = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://first.example' }))
    first.payment.enabled = false
    first.docs.enabled = false
    const second = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://second.example' }))
    expect(second.baseUrl).toBe('https://second.example')
    expect(second.payment.enabled).toBe(true)
    expect(second.docs.enabled).toBe(true)
  })
})
