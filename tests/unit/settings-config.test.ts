import { afterEach, describe, expect, it } from 'vitest'
import { findAdminNavItem, getAdminNav, isAdminNavActive } from '@/config/admin-nav'
import { navLabel } from '@/config/navigation'
import { pathOf, sectionOf } from '@/config/routes'
import { findSettingsNavItem, getSettingsNav, isSettingsNavActive } from '@/config/settings-nav'
import { createWebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/core/env/public'
import { getLocale, overwriteGetLocale } from '@/locale/paraglide/runtime.js'

const originalGetLocale = getLocale

afterEach(() => {
  overwriteGetLocale(originalGetLocale)
})

/** 构造站点配置。服务模块显式给值，不依赖随部署场景调整的出厂默认值。 */
function createConfig(
  overrides: {
    newsletter?: boolean
    apiKeys?: boolean
    admin?: boolean
    payment?: boolean
    collection?: boolean
  } = {},
) {
  const config = createWebsiteConfig(parsePublicEnv({}))
  return {
    ...config,
    newsletter: { ...config.newsletter, enabled: overrides.newsletter ?? false },
    payment: { ...config.payment, enabled: overrides.payment ?? false },
    collection: { ...config.collection, enabled: overrides.collection ?? false },
    features: {
      ...config.features,
      enableApiKeys: overrides.apiKeys ?? false,
      enableAdmin: overrides.admin ?? false,
    },
  }
}

describe('个人中心导航', () => {
  it('模块全关时只剩三项恒在的入口', () => {
    const config = createConfig()
    expect(getSettingsNav(config).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
    ])
  })

  it('newsletter 开启时「通知偏好」出现，且只受模块开关控制', () => {
    const config = createConfig({ newsletter: true })
    expect(getSettingsNav(config).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
      'notifications',
    ])
  })

  it('payment / collection / enableApiKeys 各自控制对应入口', () => {
    const config = createConfig({ payment: true, collection: true, apiKeys: true })
    expect(getSettingsNav(config).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
      'billing',
      'orders',
      'api-keys',
    ])
    const partial = createConfig({ apiKeys: true })
    expect(getSettingsNav(partial).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
      'api-keys',
    ])
  })

  it('每个入口指向对应板块，且路径不含 locale 参数', () => {
    const config = createConfig({ newsletter: true, apiKeys: true })
    expect(getSettingsNav(config).map((item) => pathOf(item.to))).toEqual([
      '/settings/profile',
      '/settings/security',
      '/settings/sessions',
      '/settings/notifications',
      '/settings/api-keys',
    ])
  })

  it('高亮只命中当前页', () => {
    const profile = getSettingsNav(createConfig())[0]
    expect(profile).toBeDefined()
    if (!profile) return
    expect(isSettingsNavActive(profile, 'profile')).toBe(true)
    expect(isSettingsNavActive(profile, 'security')).toBe(false)
  })
})

describe('管理台导航', () => {
  it('三个可折叠分组 + 概览 + 底部两项', () => {
    const nav = getAdminNav(createConfig())
    expect(nav.groups.map((group) => group.id)).toEqual(['rbac', 'billing', 'content'])
    expect(pathOf(nav.overview.to)).toBe('/admin')
    expect(nav.footer.map((item) => item.id)).toEqual(['settings', 'personal-switch'])
    expect(pathOf(nav.footer[1]?.to ?? '/{-$locale}/admin')).toBe('/settings/profile')
  })

  it('核销订单入口只在 collection 模块开启时插到订阅与积分之间', () => {
    const withoutCollection = getAdminNav(createConfig())
    const billing = (nav: ReturnType<typeof getAdminNav>) =>
      nav.groups.find((group) => group.id === 'billing')?.items.map((item) => item.id)
    expect(billing(withoutCollection)).toEqual(['orders', 'subscriptions', 'credits'])
    expect(billing(getAdminNav(createConfig({ collection: true })))).toEqual([
      'orders',
      'subscriptions',
      'collection-orders',
      'credits',
    ])
  })

  it('菜单项同时提供面包屑使用的标题与说明', () => {
    const nav = getAdminNav(createConfig())
    for (const item of [nav.overview, ...nav.groups.flatMap((group) => group.items)]) {
      expect(item.title()).toBeTruthy()
      expect(item.description()).toBeTruthy()
      expect(item.icon).toBeTruthy()
    }
  })

  it('按路由段查元数据；未注册的段返回 undefined', () => {
    const nav = getAdminNav(createConfig())
    expect(findAdminNavItem(nav, '')?.id).toBe('revenue')
    expect(findAdminNavItem(nav, 'users')?.id).toBe('users')
    expect(findAdminNavItem(nav, 'unknown')).toBeUndefined()
  })

  it('侧栏文案默认取页面标题，措辞不同的项单独给 label', () => {
    const nav = getAdminNav(createConfig({ collection: true }))
    const users = nav.groups.find((group) => group.id === 'rbac')?.items[0]
    expect(users && navLabel(users)).toBe(users?.title())

    const collectionOrders = nav.groups
      .find((group) => group.id === 'billing')
      ?.items.find((item) => item.id === 'collection-orders')
    expect(collectionOrders && navLabel(collectionOrders)).not.toBe(collectionOrders?.title())
  })

  it('高亮按目标路径判定，概览与子页互不抢占', () => {
    const nav = getAdminNav(createConfig())
    const users = nav.groups.find((group) => group.id === 'rbac')?.items[0]
    expect(users?.id).toBe('users')
    if (!users) return
    expect(isAdminNavActive(nav.overview, '')).toBe(true)
    expect(isAdminNavActive(users, '')).toBe(false)
    expect(isAdminNavActive(users, 'users')).toBe(true)
  })
})

describe('路由常量', () => {
  it('sectionOf 裁出布局内的相对段', () => {
    expect(sectionOf('/{-$locale}/admin', 'admin')).toBe('')
    expect(sectionOf('/{-$locale}/admin/users', 'admin')).toBe('users')
    expect(sectionOf('/{-$locale}/settings/profile', 'settings')).toBe('profile')
  })

  it('pathOf 去掉可选 locale 段', () => {
    expect(pathOf('/{-$locale}/settings/orders/$orderId')).toBe('/settings/orders/$orderId')
  })
})

describe('板块标题元数据', () => {
  it('个人中心每个板块都有标题、说明与图标', () => {
    for (const item of getSettingsNav(createConfig({ newsletter: true, apiKeys: true }))) {
      expect(item.title()).toBeTruthy()
      expect(item.description()).toBeTruthy()
      expect(item.icon).toBeTruthy()
    }
  })

  it('详情页沿用所属列表页的元数据', () => {
    expect(findSettingsNavItem('orders/ord_123')?.id).toBe('orders')
    expect(findSettingsNavItem('unknown')).toBeUndefined()
  })

  it('文案随请求语言变化', () => {
    // `m.*()` 读运行时 locale，单测必须显式覆盖。
    overwriteGetLocale(() => 'zh')
    expect(getSettingsNav(createConfig()).map((item) => item.title())).toEqual([
      '资料',
      '安全',
      '登录设备',
    ])
    expect(findSettingsNavItem('sessions')?.title()).toBe('登录设备')
    overwriteGetLocale(() => 'en')
    expect(getSettingsNav(createConfig()).map((item) => item.title())).toEqual([
      'Profile',
      'Security',
      'Sessions',
    ])
  })
})
