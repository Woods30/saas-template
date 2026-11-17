import { describe, expect, it } from 'vitest'
import { websiteConfig } from '../../src/config/website'
import {
  applySettingsToConfig,
  defaultSettings,
  mergeSettings,
  type SettingsGroups,
} from '../../src/core/config/settings'

/**
 * 配置合并规则。
 *
 * 数据库里的配置是后台写进来的 JSON，可能残缺也可能被手改坏。合并必须
 * **按组隔离**：坏一组只丢那一组，不能让整站配置垮掉。
 */
describe('mergeSettings', () => {
  const defaults = defaultSettings()

  it('没有存任何分组时等于默认值', () => {
    expect(mergeSettings(defaults, {})).toEqual(defaults)
  })

  it('存储的分组覆盖默认值', () => {
    const merged = mergeSettings(defaults, {
      brand: { name: 'Acme', logoAccent: 'e', tagline: '做点东西' },
    })
    expect(merged.brand.name).toBe('Acme')
    expect(merged.brand.tagline).toBe('做点东西')
    // 未覆盖的分组保持默认
    expect(merged.modules).toEqual(defaults.modules)
  })

  it('非法分组被忽略，其余分组照常生效', () => {
    const merged = mergeSettings(defaults, {
      brand: { name: 123 },
      payment: { enabled: false, provider: 'creem' },
    })
    expect(merged.brand).toEqual(defaults.brand)
    expect(merged.payment.provider).toBe('creem')
    expect(merged.payment.enabled).toBe(false)
  })

  it('null 与 undefined 视为没存', () => {
    const merged = mergeSettings(defaults, {
      brand: null,
      seo: undefined,
    })
    expect(merged.brand).toEqual(defaults.brand)
    expect(merged.seo).toEqual(defaults.seo)
  })
})

describe('applySettingsToConfig', () => {
  const settings: SettingsGroups = {
    ...defaultSettings(),
    brand: { name: 'Acme', logoAccent: 'e', tagline: '' },
    modules: {
      ...defaultSettings().modules,
      docs: false,
      blog: false,
      features: { ...defaultSettings().modules.features, enableAdmin: false },
    },
    payment: { enabled: false, provider: 'creem' },
    mail: { enabled: true, provider: 'cloudflare', supportEmail: 'hi@acme.dev' },
  }

  it('品牌名进入 metadata', () => {
    const config = applySettingsToConfig(websiteConfig, settings)
    expect(config.metadata.name).toBe('Acme')
    expect(config.metadata.logoAccent).toBe('e')
  })

  it('模块开关覆盖配置', () => {
    const config = applySettingsToConfig(websiteConfig, settings)
    expect(config.docs.enabled).toBe(false)
    expect(config.blog.enabled).toBe(false)
    expect(config.features.enableAdmin).toBe(false)
  })

  it('支付与邮件渠道覆盖配置', () => {
    const config = applySettingsToConfig(websiteConfig, settings)
    expect(config.payment.enabled).toBe(false)
    expect(config.payment.provider).toBe('creem')
    expect(config.mail.provider).toBe('cloudflare')
    expect(config.mail.supportEmail).toBe('hi@acme.dev')
  })

  it('没有覆盖到的字段保持原值', () => {
    const config = applySettingsToConfig(websiteConfig, settings)
    expect(config.baseUrl).toBe(websiteConfig.baseUrl)
    expect(config.ui).toEqual(websiteConfig.ui)
  })
})
