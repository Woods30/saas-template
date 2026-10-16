import { afterEach, describe, expect, it } from 'vitest'
import type { MenuItem, MenuLinkItem } from '@/config/navigation'
import { getSettingsSectionMeta, getSettingsSections } from '@/config/settings'
import { createWebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import { getLocale, overwriteGetLocale } from '@/locale/paraglide/runtime.js'

const originalGetLocale = getLocale

afterEach(() => {
  overwriteGetLocale(originalGetLocale)
})

function createConfig(
  overrides: { newsletter?: boolean; apiKeys?: boolean; admin?: boolean } = {},
) {
  const config = createWebsiteConfig(parsePublicEnv({}))
  return {
    ...config,
    newsletter: { ...config.newsletter, enabled: overrides.newsletter ?? false },
    features: {
      ...config.features,
      enableApiKeys: overrides.apiKeys ?? false,
      enableAdmin: overrides.admin ?? false,
    },
  }
}

function ctx(
  config: ReturnType<typeof createConfig>,
  role: string | undefined = undefined,
): { config: ReturnType<typeof createConfig>; authenticated: boolean; role?: string } {
  return { config, authenticated: true, role }
}

/** 摊平顶层 group，得到所有叶子链接项（顺序即渲染顺序）。 */
function leafItems(items: readonly MenuItem[]): MenuLinkItem[] {
  const out: MenuLinkItem[] = []
  for (const item of items) {
    if (item.kind === 'group') out.push(...leafItems(item.items))
    else if (item.kind === 'link') out.push(item)
  }
  return out
}

/** 顶层 group 的 id 列表。 */
function groupIds(items: readonly MenuItem[]): string[] {
  return items.filter((item) => item.kind === 'group').map((item) => item.id)
}

describe('个人中心导航分组', () => {
  it('返回两个顶层 group：personal 与 admin', () => {
    const config = createConfig({ admin: true })
    expect(groupIds(getSettingsSections('en', ctx(config, 'admin')))).toEqual(['personal', 'admin'])
  })

  it('模块关闭时 personal 组不含「通知偏好」，其余三项恒在', () => {
    const config = createConfig({ newsletter: false })
    const personal = leafItems(getSettingsSections('en', ctx(config)))
      .filter((item) => item.id !== 'admin')
      .map((item) => item.id)
    expect(personal).toEqual(['profile', 'security', 'sessions'])
  })

  it('newsletter 开启时「通知偏好」出现在 personal 组末尾', () => {
    const config = createConfig({ newsletter: true })
    const personal = leafItems(getSettingsSections('en', ctx(config)))
      .filter((item) => item.id !== 'admin')
      .map((item) => item.id)
    expect(personal).toEqual(['profile', 'security', 'sessions', 'notifications'])
  })

  it('enableApiKeys 开启时含「API 密钥」，且该项按 feature 门禁', () => {
    const config = createConfig({ apiKeys: true })
    const apiKeys = leafItems(getSettingsSections('en', ctx(config))).find(
      (item) => item.id === 'api-keys',
    )
    expect(apiKeys).toBeDefined()
    expect(apiKeys?.visibility?.feature).toBe('enableApiKeys')
    expect(apiKeys?.destination).toEqual({
      kind: 'internal',
      options: expect.objectContaining({
        to: '/{-$locale}/dashboard/api-keys',
        params: { locale: 'en' },
      }),
    })
  })

  it('enableApiKeys 关闭时不含「API 密钥」', () => {
    const config = createConfig({ apiKeys: false })
    expect(leafItems(getSettingsSections('en', ctx(config))).map((item) => item.id)).not.toContain(
      'api-keys',
    )
  })

  it('链接指向对应板块，且都带 locale 参数', () => {
    const config = createConfig({ newsletter: true, apiKeys: true })
    const destinations = leafItems(getSettingsSections('en', ctx(config))).map((item) =>
      item.destination.kind === 'internal' ? item.destination.options : null,
    )
    expect(destinations).toEqual([
      expect.objectContaining({ to: '/{-$locale}/dashboard/profile', params: { locale: 'en' } }),
      expect.objectContaining({ to: '/{-$locale}/dashboard/security', params: { locale: 'en' } }),
      expect.objectContaining({ to: '/{-$locale}/dashboard/sessions', params: { locale: 'en' } }),
      expect.objectContaining({
        to: '/{-$locale}/dashboard/notifications',
        params: { locale: 'en' },
      }),
      expect.objectContaining({ to: '/{-$locale}/dashboard/api-keys', params: { locale: 'en' } }),
    ])
  })

  it('文案随请求语言变化', () => {
    const config = createConfig()
    // 文案在调用时经 `m.*()` 求值，而 Paraglide 的 `m` 读的是运行时 locale，
    // 不是传给工厂的 `locale` 参数——单测里必须显式覆盖它（与 navigation.test.ts 同法）。
    overwriteGetLocale(() => 'zh')
    expect(leafItems(getSettingsSections('zh', ctx(config))).map((item) => item.title)).toEqual([
      '资料',
      '安全',
      '登录设备',
    ])
    overwriteGetLocale(() => 'en')
    expect(leafItems(getSettingsSections('en', ctx(config))).map((item) => item.title)).toEqual([
      'Profile',
      'Security',
      'Sessions',
    ])
  })
})

describe('admin 组可见性', () => {
  it('admin 角色 + enableAdmin 开启时出现「用户管理」，指向 /dashboard/admin/users', () => {
    const config = createConfig({ admin: true })
    const admin = leafItems(getSettingsSections('en', ctx(config, 'admin'))).find(
      (item) => item.id === 'admin',
    )
    expect(admin).toBeDefined()
    expect(admin?.visibility).toEqual(
      expect.objectContaining({ roles: ['admin'], feature: 'enableAdmin' }),
    )
    expect(admin?.destination).toEqual({
      kind: 'internal',
      options: expect.objectContaining({
        to: '/{-$locale}/dashboard/admin/users',
        params: { locale: 'en' },
      }),
    })
  })

  it('非 admin 角色不出现该项（即使 enableAdmin 开启）', () => {
    const config = createConfig({ admin: true })
    for (const role of ['user', 'viewer', undefined]) {
      expect(
        leafItems(getSettingsSections('en', ctx(config, role))).map((item) => item.id),
      ).not.toContain('admin')
    }
  })

  it('enableAdmin 关闭时不出现该项（即使角色是 admin）', () => {
    const config = createConfig({ admin: false })
    expect(
      leafItems(getSettingsSections('en', ctx(config, 'admin'))).map((item) => item.id),
    ).not.toContain('admin')
  })

  it('admin 组被整体过滤时，顶层不再残留空组', () => {
    const config = createConfig({ admin: true })
    expect(groupIds(getSettingsSections('en', ctx(config, 'user')))).toEqual(['personal'])
  })
})

describe('板块标题元数据', () => {
  it('每个板块都有标题、说明与图标', () => {
    for (const section of [
      'profile',
      'security',
      'sessions',
      'notifications',
      'api-keys',
      'admin',
    ] as const) {
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
