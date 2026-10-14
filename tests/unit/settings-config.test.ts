import { afterEach, describe, expect, it } from 'vitest'
import { getSettingsSectionMeta, getSettingsSections } from '@/config/settings'
import { createWebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import { getLocale, overwriteGetLocale } from '@/locale/paraglide/runtime.js'

const originalGetLocale = getLocale

afterEach(() => {
  overwriteGetLocale(originalGetLocale)
})

function createConfig(overrides: { newsletter?: boolean } = {}) {
  const config = createWebsiteConfig(parsePublicEnv({}))
  return { ...config, newsletter: { ...config.newsletter, enabled: overrides.newsletter ?? false } }
}

function ctx(config: ReturnType<typeof createConfig>) {
  return { config, authenticated: true }
}

describe('个人中心导航', () => {
  it('模块关闭时不含「通知偏好」，其余三项恒在', () => {
    const config = createConfig({ newsletter: false })
    expect(getSettingsSections('en', ctx(config)).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
    ])
  })

  it('newsletter 开启时「通知偏好」出现在末尾', () => {
    const config = createConfig({ newsletter: true })
    expect(getSettingsSections('en', ctx(config)).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
      'notifications',
    ])
  })

  it('链接指向对应板块，且都带 locale 参数', () => {
    const config = createConfig({ newsletter: true })
    const destinations = getSettingsSections('en', ctx(config)).map((item) =>
      item.destination.kind === 'internal' ? item.destination.options : null,
    )
    expect(destinations).toEqual([
      expect.objectContaining({ to: '/{-$locale}/settings/profile', params: { locale: 'en' } }),
      expect.objectContaining({ to: '/{-$locale}/settings/security', params: { locale: 'en' } }),
      expect.objectContaining({ to: '/{-$locale}/settings/sessions', params: { locale: 'en' } }),
      expect.objectContaining({
        to: '/{-$locale}/settings/notifications',
        params: { locale: 'en' },
      }),
    ])
  })

  it('文案随请求语言变化', () => {
    const config = createConfig()
    // 文案在调用时经 `m.*()` 求值，而 Paraglide 的 `m` 读的是运行时 locale，
    // 不是传给工厂的 `locale` 参数——单测里必须显式覆盖它（与 navigation.test.ts 同法）。
    overwriteGetLocale(() => 'zh')
    expect(getSettingsSections('zh', ctx(config)).map((item) => item.title)).toEqual([
      '资料',
      '安全',
      '登录设备',
    ])
    overwriteGetLocale(() => 'en')
    expect(getSettingsSections('en', ctx(config)).map((item) => item.title)).toEqual([
      'Profile',
      'Security',
      'Sessions',
    ])
  })
})

describe('板块标题元数据', () => {
  it('每个板块都有标题、说明与图标', () => {
    for (const section of ['profile', 'security', 'sessions', 'notifications'] as const) {
      const meta = getSettingsSectionMeta(section)
      expect(meta.title).toBeTruthy()
      expect(meta.description).toBeTruthy()
      expect(meta.icon).toBeTruthy()
    }
  })

  it('中文标题与导航项一致', () => {
    overwriteGetLocale(() => 'zh')
    expect(getSettingsSectionMeta('profile').title).toBe('资料')
    expect(getSettingsSectionMeta('sessions').title).toBe('登录设备')
  })
})
