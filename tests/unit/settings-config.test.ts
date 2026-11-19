import { afterEach, describe, expect, it } from 'vitest'
import {
  findAdminNavItem,
  firstAdminNavItem,
  getAdminNav,
  isAdminNavActive,
} from '@/config/admin-nav'
import { navLabel } from '@/config/navigation'
import { adminRoutes, pathOf, sectionOf, settingsRoutes } from '@/config/routes'
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
    payment?: boolean
    manualPayments?: boolean
  } = {},
) {
  const config = createWebsiteConfig(parsePublicEnv({}))
  return {
    ...config,
    newsletter: { ...config.newsletter, enabled: overrides.newsletter ?? false },
    payment: { ...config.payment, enabled: overrides.payment ?? false },
    manualPayments: { ...config.manualPayments, enabled: overrides.manualPayments ?? false },
    userFeatures: {
      ...config.userFeatures,
      apiKeys: overrides.apiKeys ?? false,
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

  it('payment / manualPayments / apiKeys 各自控制对应入口', () => {
    const config = createConfig({ payment: true, manualPayments: true, apiKeys: true })
    expect(getSettingsNav(config).map((item) => item.id)).toEqual([
      'profile',
      'security',
      'sessions',
      'billing',
      'manual-payments',
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

/** `editor` 内置角色的权限点：内容与工单的读写。 */
const EDITOR_PERMISSIONS = [
  'admin.content.read',
  'admin.content.write',
  'admin.tickets.read',
  'admin.tickets.write',
] as const

const navItemIds = (nav: ReturnType<typeof getAdminNav>) => ({
  overview: nav.overview?.id,
  groups: nav.groups.map((group) => ({
    id: group.id,
    items: group.items.map((item) => item.id),
  })),
  footer: nav.footer.map((item) => item.id),
})

describe('管理台导航', () => {
  it('三个可折叠分组 + 概览 + 底部两项', () => {
    const nav = getAdminNav(createConfig())
    expect(nav.groups.map((group) => group.id)).toEqual(['rbac', 'billing', 'content'])
    expect(nav.overview && pathOf(nav.overview.to)).toBe('/admin')
    expect(nav.footer.map((item) => item.id)).toEqual(['settings', 'personal-switch'])
    expect(pathOf(nav.footer[1]?.to ?? '/{-$locale}/admin')).toBe('/settings/profile')
  })

  it('核销订单入口只在 manualPayments 模块开启时插到订阅与积分之间', () => {
    const withoutManualPayment = getAdminNav(createConfig())
    const billing = (nav: ReturnType<typeof getAdminNav>) =>
      nav.groups.find((group) => group.id === 'billing')?.items.map((item) => item.id)
    expect(billing(withoutManualPayment)).toEqual(['payments', 'subscriptions', 'credits'])
    expect(billing(getAdminNav(createConfig({ manualPayments: true })))).toEqual([
      'payments',
      'subscriptions',
      'manual-payments',
      'credits',
    ])
  })

  it('菜单项同时提供面包屑使用的标题与说明', () => {
    const nav = getAdminNav(createConfig())
    const items = [
      ...(nav.overview ? [nav.overview] : []),
      ...nav.groups.flatMap((group) => group.items),
    ]
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
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
    const nav = getAdminNav(createConfig({ manualPayments: true }))
    const users = nav.groups.find((group) => group.id === 'rbac')?.items[0]
    expect(users && navLabel(users)).toBe(users?.title())

    const manualPaymentOrders = nav.groups
      .find((group) => group.id === 'billing')
      ?.items.find((item) => item.id === 'manual-payments')
    expect(manualPaymentOrders && navLabel(manualPaymentOrders)).not.toBe(
      manualPaymentOrders?.title(),
    )
  })

  it('高亮按目标路径判定，概览与子页互不抢占', () => {
    const nav = getAdminNav(createConfig())
    const users = nav.groups.find((group) => group.id === 'rbac')?.items[0]
    expect(users?.id).toBe('users')
    if (!users || !nav.overview) return
    expect(isAdminNavActive(nav.overview, '')).toBe(true)
    expect(isAdminNavActive(users, '')).toBe(false)
    expect(isAdminNavActive(users, 'users')).toBe(true)
  })

  it('传权限时逐项过滤：editor 只保留内容与工单', () => {
    const nav = getAdminNav(createConfig(), EDITOR_PERMISSIONS)
    expect(navItemIds(nav)).toEqual({
      // 概览要 admin.orders.read，editor 没有。
      overview: undefined,
      // rbac（users/roles/audit）与 billing（payments/...）整组被丢弃。
      groups: [{ id: 'content', items: ['content', 'tickets'] }],
      // 系统设置需 admin.settings.read；切回个人中心无权限要求，始终保留。
      footer: ['personal-switch'],
    })
  })

  it("通配符 '*' 保留全部菜单项", () => {
    const nav = getAdminNav(createConfig({ manualPayments: true }), ['*'])
    expect(navItemIds(nav)).toEqual({
      overview: 'revenue',
      groups: [
        { id: 'rbac', items: ['users', 'roles', 'audit'] },
        { id: 'billing', items: ['payments', 'subscriptions', 'manual-payments', 'credits'] },
        { id: 'content', items: ['content', 'tickets', 'tasks'] },
      ],
      footer: ['settings', 'personal-switch'],
    })
  })

  it('逐级通配符覆盖具体权限点', () => {
    const nav = getAdminNav(createConfig(), ['admin.content.*', 'admin.settings.*'])
    expect(navItemIds(nav)).toEqual({
      overview: undefined,
      groups: [{ id: 'content', items: ['content'] }],
      footer: ['settings', 'personal-switch'],
    })
  })

  it('不传权限时菜单树不受影响（元数据解析依赖这一点）', () => {
    expect(navItemIds(getAdminNav(createConfig()))).toEqual({
      overview: 'revenue',
      groups: [
        { id: 'rbac', items: ['users', 'roles', 'audit'] },
        { id: 'billing', items: ['payments', 'subscriptions', 'credits'] },
        { id: 'content', items: ['content', 'tickets', 'tasks'] },
      ],
      footer: ['settings', 'personal-switch'],
    })
  })

  it('索引页重定向以第一个可访问项为准', () => {
    const config = createConfig()
    // editor：概览被过滤，第一个可访问项是内容。
    expect(firstAdminNavItem(getAdminNav(config, EDITOR_PERMISSIONS))?.to).toBe(adminRoutes.content)
    // 只有系统设置权限：分组与概览都空，落到底部「系统设置」。
    expect(firstAdminNavItem(getAdminNav(config, ['admin.settings.read']))?.to).toBe(
      adminRoutes.settings,
    )
    // 持 admin.orders.read：概览本身可访问，不产生重定向目标偏差。
    expect(firstAdminNavItem(getAdminNav(config, ['admin.orders.read']))?.id).toBe('revenue')
    // 只有无法映射到菜单的权限：退到始终可见的个人中心。
    expect(firstAdminNavItem(getAdminNav(config, ['admin.users.write']))?.to).toBe(
      settingsRoutes.profile,
    )
  })
})

describe('路由常量', () => {
  it('sectionOf 裁出布局内的相对段', () => {
    expect(sectionOf('/{-$locale}/admin', 'admin')).toBe('')
    expect(sectionOf('/{-$locale}/admin/users', 'admin')).toBe('users')
    expect(sectionOf('/{-$locale}/settings/profile', 'settings')).toBe('profile')
  })

  it('pathOf 去掉可选 locale 段', () => {
    expect(pathOf('/{-$locale}/settings/manual-payments/$orderId')).toBe(
      '/settings/manual-payments/$orderId',
    )
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
    expect(findSettingsNavItem('manual-payments/ord_123')?.id).toBe('manual-payments')
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
