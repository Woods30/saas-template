import { describe, expect, it } from 'vitest'
import { baseConfig } from '../../src/config/website'
import { defaultSettingsValues, SETTING_FIELDS } from '../../src/core/config/registry'
import {
  applySettingsToConfig,
  resolveSettingsValues,
  validateGroupValues,
} from '../../src/core/config/settings'

/**
 * 配置解析与落地规则。
 *
 * 数据库里的值是后台写进来的 JSON，可能残缺也可能被手改坏。解析必须
 * **按字段隔离**：坏一个字段只丢那一个，不能让整站配置垮掉。
 */
describe('resolveSettingsValues', () => {
  const defaults = defaultSettingsValues()

  it('没有存任何值时等于默认值', () => {
    expect(resolveSettingsValues({})).toEqual(defaults)
  })

  it('存了的值覆盖默认值', () => {
    const values = resolveSettingsValues({
      'brand.name': 'Acme',
      'brand.tagline': '做点东西',
    })
    expect(values['brand.name']).toBe('Acme')
    expect(values['brand.tagline']).toBe('做点东西')
    expect(values['modules.blog']).toBe(defaults['modules.blog'])
  })

  it('非法字段被忽略，其余字段照常生效', () => {
    const values = resolveSettingsValues({
      'brand.name': 123,
      'payment.provider': 'creem',
    })
    expect(values['brand.name']).toBe(defaults['brand.name'])
    expect(values['payment.provider']).toBe('creem')
  })

  it('注册表之外的键被忽略', () => {
    expect(resolveSettingsValues({ legacy: { name: 'x' } })).toEqual(defaults)
  })

  it('select 的非法取值回落默认值', () => {
    expect(
      resolveSettingsValues({ 'payment.checkoutMode': 'paypal' })['payment.checkoutMode'],
    ).toBe('provider')
  })

  it('url 字段拒绝内嵌凭据与非法协议', () => {
    expect(
      resolveSettingsValues({ 'social.github': 'https://user:pass@x.dev' })['social.github'],
    ).toBe('')
    expect(resolveSettingsValues({ 'social.github': 'javascript:alert(1)' })['social.github']).toBe(
      '',
    )
    expect(
      resolveSettingsValues({ 'social.github': 'https://github.com/acme' })['social.github'],
    ).toBe('https://github.com/acme')
  })

  it('email 字段拒绝非邮箱地址，空串表示未设置', () => {
    expect(resolveSettingsValues({ 'mail.from': 'nope' })['mail.from']).toBe('')
    expect(resolveSettingsValues({ 'mail.from': '' })['mail.from']).toBe('')
  })
})

describe('validateGroupValues', () => {
  it('只保留该组的字段', () => {
    const result = validateGroupValues('brand', {
      'brand.name': 'Acme',
      'brand.tagline': '',
      'brand.logoAccent': '',
      'payment.provider': 'creem',
    })
    expect(result).toEqual({ 'brand.name': 'Acme', 'brand.tagline': '', 'brand.logoAccent': '' })
  })

  it('组内任一字段非法即整组拒绝', () => {
    expect(() =>
      validateGroupValues('brand', { 'brand.name': 'Acme', 'brand.tagline': 42 }),
    ).toThrow()
  })

  it('不存在的分组直接报错', () => {
    expect(() => validateGroupValues('nope', {})).toThrow()
  })

  it('列表字段接受字符串数组', () => {
    expect(validateGroupValues('analytics', { 'analytics.providers': ['ga', 'umami'] })).toEqual({
      'analytics.providers': ['ga', 'umami'],
    })
  })
})

describe('applySettingsToConfig', () => {
  const values = {
    ...defaultSettingsValues(),
    'brand.name': 'Acme',
    'brand.logoAccent': 'e',
    'modules.docs': false,
    'modules.blog': false,
    'modules.payment': false,
    'modules.mail': true,
    'features.enableAdmin': false,
    'payment.provider': 'creem',
    'payment.checkoutMode': 'collection',
    'mail.provider': 'cloudflare',
    'mail.supportEmail': 'hi@acme.dev',
    'analytics.providers': ['umami'],
    'analytics.umamiWebsiteId': 'site-1',
    'turnstile.siteKey': 'turnstile-key',
  }

  it('品牌名进入 metadata', () => {
    const config = applySettingsToConfig(baseConfig, values)
    expect(config.metadata.name).toBe('Acme')
    expect(config.metadata.logoAccent).toBe('e')
  })

  it('模块开关覆盖配置，且各分类 enabled 与模块开关同源', () => {
    const config = applySettingsToConfig(baseConfig, values)
    expect(config.docs.enabled).toBe(false)
    expect(config.blog.enabled).toBe(false)
    expect(config.features.enableAdmin).toBe(false)
    expect(config.payment.enabled).toBe(false)
    expect(config.mail.enabled).toBe(true)
  })

  it('渠道选择与结账链路进入配置', () => {
    const config = applySettingsToConfig(baseConfig, values)
    expect(config.payment.provider).toBe('creem')
    expect(config.payment.checkoutMode).toBe('collection')
    expect(config.mail.provider).toBe('cloudflare')
    expect(config.mail.supportEmail).toBe('hi@acme.dev')
  })

  it('分析渠道的公开标识进入配置（随页面下发浏览器）', () => {
    const config = applySettingsToConfig(baseConfig, values)
    expect(config.analytics.providers).toEqual(['umami'])
    expect(config.analytics.config.umamiWebsiteId).toBe('site-1')
  })

  it('Turnstile 站点 key 进入配置', () => {
    expect(applySettingsToConfig(baseConfig, values).captcha.siteKey).toBe(
      values['turnstile.siteKey'],
    )
  })

  it('没有覆盖到的结构字段保持原值', () => {
    const config = applySettingsToConfig(baseConfig, values)
    expect(config.baseUrl).toBe(baseConfig.baseUrl)
    expect(config.ui).toEqual(baseConfig.ui)
    expect(config.landingOffer).toEqual(baseConfig.landingOffer)
  })

  it('注册表覆盖了默认值的每个字段都有解析路径', () => {
    // 防止新增字段后忘了在 applySettingsToConfig 里消费，静默不生效。
    const config = applySettingsToConfig(baseConfig, defaultSettingsValues())
    for (const key of ['brand.name', 'modules.docs', 'features.enableAdmin'] as const) {
      expect(SETTING_FIELDS.some((field) => field.key === key)).toBe(true)
    }
    expect(config.metadata.name.length).toBeGreaterThan(0)
  })
})
