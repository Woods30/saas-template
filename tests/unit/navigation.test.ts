import { linkOptions } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFooterLinks } from '@/config/footer-config'
import { getNavbarActions, getNavbarLinks } from '@/config/navbar-config'
import {
  filterMenuItems,
  getPublicLinkOptions,
  type MenuItem,
  type MenuLinkItem,
  type PublicTarget,
} from '@/config/navigation'
import { getSocialLinks, isSafeSocialUrl } from '@/config/social-config'
import { createWebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import type { Locale } from '@/lib/locale'
import { getLocale, overwriteGetLocale } from '@/locale/paraglide/runtime.js'

const originalGetLocale = getLocale

afterEach(() => {
  overwriteGetLocale(originalGetLocale)
})

function createConfig() {
  return createWebsiteConfig(parsePublicEnv({}))
}

function homeLink(id: string, visibility?: MenuLinkItem['visibility']): MenuLinkItem {
  return {
    kind: 'link',
    id,
    title: id,
    visibility,
    destination: { kind: 'internal', options: getPublicLinkOptions('home', 'en') },
  }
}

// 仅供 TypeScript 编译验证，不在运行时执行。
function verifyInvalidRouterOptions() {
  // @ts-expect-error 不存在的路由必须被 Router 拒绝。
  linkOptions({ to: '/{-$locale}/not-a-route', params: { locale: 'zh' } })
  // @ts-expect-error 法律路由必须提供 slug。
  linkOptions({ to: '/{-$locale}/marketing/legal/$slug', params: { locale: 'zh' } })
}
void verifyInvalidRouterOptions

describe('公共链接目标', () => {
  const targets: [PublicTarget, string, string?][] = [
    ['home', '/{-$locale}'],
    ['docs', '/{-$locale}/docs'],
    ['blog', '/{-$locale}/marketing/blog'],
    ['changelog', '/{-$locale}/marketing/changelog'],
    ['pricing', '/{-$locale}'],
    ['contact', '/{-$locale}/marketing/contact'],
    ['roadmap', '/{-$locale}/marketing/roadmap'],
    ['waitlist', '/{-$locale}/marketing/waitlist'],
    ['login', '/{-$locale}/auth/login'],
    ['terms', '/{-$locale}/marketing/legal/$slug', 'terms'],
    ['privacy', '/{-$locale}/marketing/legal/$slug', 'privacy'],
  ]

  it.each(targets)('%s 注入 locale 并绑定真实路由及法律 slug', (target, to, slug) => {
    for (const locale of ['zh', 'en'] as const) {
      const options = getPublicLinkOptions(target, locale)
      expect(options.to).toBe(to)
      if (target === 'pricing') expect(options).toHaveProperty('hash', 'pricing')
      expect(options.params).toEqual(slug ? { locale, slug } : { locale })
    }
  })

  it('保留首页 hash，不把 hash 传给其他目标', () => {
    expect(getPublicLinkOptions('home', 'en', 'features')).toEqual({
      to: '/{-$locale}',
      params: { locale: 'en' },
      hash: 'features',
    })
    expect(getPublicLinkOptions('docs', 'en', 'features')).not.toHaveProperty('hash')
  })
})

describe('导航配置工厂', () => {
  it('zh → en → zh 连续调用时重新求值所有工厂的消息', () => {
    const config = createConfig()
    config.mail.supportEmail = ['support', 'jerbix.dev'].join('@')
    const ctx = { config, authenticated: false }
    const titles: string[][] = []
    for (const locale of ['zh', 'en', 'zh'] as const satisfies readonly Locale[]) {
      overwriteGetLocale(() => locale)
      const navbar = getNavbarLinks(locale, ctx)
      const actions = getNavbarActions(locale, config)
      const footer = getFooterLinks(locale, ctx)
      const social = getSocialLinks(config, locale)
      titles.push([
        navbar[0]?.kind === 'link' ? navbar[0].title : '',
        actions.login.title,
        actions.primary.title,
        footer[0]?.kind === 'group' ? footer[0].title : '',
        footer[1]?.kind === 'group' ? footer[1].title : '',
        social[0]?.title ?? '',
      ])
    }
    expect(titles).toEqual([
      ['特性', '登录', '开始构建', '产品', '资源', '联系邮箱'],
      ['Features', 'Sign in', 'Start building', 'Product', 'Resources', 'Support email'],
      ['特性', '登录', '开始构建', '产品', '资源', '联系邮箱'],
    ])
  })

  it('Navbar 保留三个真实首页锚点和独立 Docs 链接', () => {
    const items = getNavbarLinks('en', { config: createConfig(), authenticated: false })
    expect(items.map((item) => item.id)).toEqual(['features', 'workflow', 'template', 'docs'])
    expect(items.map((item) => item.kind === 'link' && item.destination)).toEqual([
      { kind: 'internal', options: getPublicLinkOptions('home', 'en', 'features') },
      { kind: 'internal', options: getPublicLinkOptions('home', 'en', 'workflow') },
      { kind: 'internal', options: getPublicLinkOptions('home', 'en', 'pricing') },
      { kind: 'internal', options: getPublicLinkOptions('docs', 'en') },
    ])
  })

  it('Footer 独立定义 product / resources 的 children 与目标', () => {
    const items = getFooterLinks('en', { config: createConfig(), authenticated: false })
    expect(items.map((item) => item.id)).toEqual(['product', 'resources'])
    const product = items[0]
    const resources = items[1]
    expect(product?.kind === 'group' && product.items.map((item) => item.id)).toEqual([
      'features',
      'workflow',
      'template',
      'changelog',
    ])
    // contact 默认关闭，菜单项随模块门禁一并消失。
    expect(resources?.kind === 'group' && resources.items.map((item) => item.id)).toEqual([
      'docs',
      'blog',
      'terms',
      'privacy',
      'roadmap',
      'waitlist',
    ])
    expect(
      resources?.kind === 'group' &&
        resources.items.map((item) => item.kind === 'link' && item.destination),
    ).toEqual(
      (['docs', 'blog', 'terms', 'privacy', 'roadmap', 'waitlist'] as const).map((target) => ({
        kind: 'internal',
        options: getPublicLinkOptions(target, 'en'),
      })),
    )
  })

  it('关闭 docs 后 Navbar / Footer 移除 Docs，主按钮回退首页 features', () => {
    const config = createConfig()
    config.docs.enabled = false
    const ctx = { config, authenticated: false }
    expect(getNavbarLinks('zh', ctx).map((item) => item.id)).toEqual([
      'features',
      'workflow',
      'template',
    ])
    const resources = getFooterLinks('zh', ctx).find((item) => item.id === 'resources')
    expect(resources?.kind === 'group' && resources.items.map((item) => item.id)).toEqual([
      'blog',
      'terms',
      'privacy',
      'roadmap',
      'waitlist',
    ])
    const actions = getNavbarActions('zh', config)
    expect(actions.primary.destination).toEqual({
      kind: 'internal',
      options: getPublicLinkOptions('home', 'zh', 'features'),
    })
    expect(actions.login.destination).toEqual({
      kind: 'internal',
      options: getPublicLinkOptions('login', 'zh'),
    })
  })

  it('开启 contact 模块后 Footer 才出现联系入口', () => {
    // 菜单项必须跟着开关走，否则默认配置下会给出点开即 404 的链接。
    const config = createConfig()
    config.contact.enabled = true
    const resources = getFooterLinks('en', { config, authenticated: false }).find(
      (item) => item.id === 'resources',
    )
    expect(resources?.kind === 'group' && resources.items.map((item) => item.id)).toEqual([
      'docs',
      'blog',
      'terms',
      'privacy',
      'contact',
      'roadmap',
      'waitlist',
    ])
  })

  it('启用 docs 时主按钮指向 Docs', () => {
    expect(getNavbarActions('en', createConfig()).primary.destination).toEqual({
      kind: 'internal',
      options: getPublicLinkOptions('docs', 'en'),
    })
  })

  it('Footer 分别按 blog / changelog 开关过滤', () => {
    const config = createConfig()
    config.blog.enabled = false
    config.changelog.enabled = false
    const items = getFooterLinks('en', { config, authenticated: false })
    expect(
      items.map((item) => item.kind === 'group' && item.items.map((child) => child.id)),
    ).toEqual([
      ['features', 'workflow', 'template'],
      ['docs', 'terms', 'privacy', 'roadmap', 'waitlist'],
    ])
  })
})

describe('菜单过滤', () => {
  it('移除空组与连续分隔符且不修改输入', () => {
    const items: MenuItem[] = [
      { kind: 'separator', id: 'first' },
      { kind: 'group', id: 'docs', title: 'Docs', visibility: { module: 'docs' }, items: [] },
      {
        kind: 'link',
        id: 'home',
        title: 'Home',
        destination: {
          kind: 'internal',
          options: getPublicLinkOptions('home', 'en'),
        },
      },
      { kind: 'separator', id: 'last' },
    ]
    const original = structuredClone(items)
    const config = createConfig()
    config.docs.enabled = false
    expect(filterMenuItems(items, { config, authenticated: false })).toEqual([items[2]])
    expect(items).toEqual(original)
  })

  it('递归移除空组，规范每层首尾及连续分隔符，保留输入', () => {
    const first = homeLink('one')
    const second = homeLink('two')
    const items: MenuItem[] = [
      { kind: 'separator', id: 'start' },
      {
        kind: 'group',
        id: 'empty',
        title: 'Empty',
        items: [
          {
            kind: 'group',
            id: 'nested-empty',
            title: 'Nested',
            items: [homeLink('disabled', { module: 'docs' })],
          },
        ],
      },
      {
        kind: 'group',
        id: 'keep',
        title: 'Keep',
        items: [
          { kind: 'separator', id: 'inner-start' },
          first,
          { kind: 'separator', id: 'middle' },
          homeLink('hidden', { authenticated: true }),
          { kind: 'separator', id: 'duplicate' },
          second,
          { kind: 'separator', id: 'inner-end' },
        ],
      },
      { kind: 'separator', id: 'end' },
    ]
    const original = structuredClone(items)
    const config = createConfig()
    config.docs.enabled = false
    expect(filterMenuItems(items, { config, authenticated: false })).toEqual([
      {
        kind: 'group',
        id: 'keep',
        title: 'Keep',
        items: [first, { kind: 'separator', id: 'middle' }, second],
      },
    ])
    expect(items).toEqual(original)
  })

  it('空菜单与仅分隔符菜单返回空数组', () => {
    const ctx = { config: createConfig(), authenticated: false }
    expect(filterMenuItems([], ctx)).toEqual([])
    expect(filterMenuItems([{ kind: 'separator', id: 'only' }], ctx)).toEqual([])
  })

  it.each([
    [false, undefined, ['public', 'guest']],
    [false, 'admin', ['public', 'guest']],
    [true, undefined, ['public', 'member']],
    [true, 'viewer', ['public', 'member']],
    [true, 'admin', ['public', 'member', 'admin']],
    [true, 'editor', ['public', 'member', 'admin']],
  ] as const)('authenticated=%s / role=%s 联合判断可见性', (authenticated, role, ids) => {
    const items = [
      homeLink('public'),
      homeLink('guest', { authenticated: false }),
      homeLink('member', { authenticated: true }),
      homeLink('admin', { roles: ['admin', 'editor'] }),
      homeLink('no-roles', { roles: [] }),
      homeLink('conflict', { authenticated: false, roles: ['admin'] }),
    ]
    expect(
      filterMenuItems(items, { config: createConfig(), authenticated, role }).map(
        (item) => item.id,
      ),
    ).toEqual(ids)
  })

  // 功能开关没有 `.enabled` 字段，必须走 `ctx.config.features[flag]`。
  it('features 开关关闭时隐藏菜单项，开启时保留', () => {
    const items = [homeLink('keys', { feature: 'enableApiKeys' })]
    const off = createConfig()
    off.features.enableApiKeys = false
    const on = createConfig()
    on.features.enableApiKeys = true
    expect(filterMenuItems(items, { config: off, authenticated: true })).toEqual([])
    expect(filterMenuItems(items, { config: on, authenticated: true })).toEqual(items)
  })

  // 管理入口需 role 与 feature 同时满足。
  it('role 与 feature 联合约束：任一不满足即隐藏', () => {
    const items = [homeLink('admin', { roles: ['admin'], feature: 'enableAdmin' })]
    const on = createConfig()
    on.features.enableAdmin = true
    const off = createConfig()
    off.features.enableAdmin = false

    expect(filterMenuItems(items, { config: on, authenticated: true, role: 'admin' })).toEqual(
      items,
    )
    // 角色不符。
    expect(filterMenuItems(items, { config: on, authenticated: true, role: 'user' })).toEqual([])
    // flag 关闭。
    expect(filterMenuItems(items, { config: off, authenticated: true, role: 'admin' })).toEqual([])
  })
})

describe('社交配置', () => {
  it.each([
    '',
    'not a url',
    '/relative',
    '//example.com',
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'mailto:support@example.com',
    'https://user@example.com',
    'https://user:password@example.com',
  ])('拒绝非法社交地址 %s 且不输出链接', (value) => {
    expect(isSafeSocialUrl(value)).toBe(false)
    const config = createConfig()
    // 只看社交平台本身：支持邮箱是另一条独立的链接，默认配置里已有值。
    config.mail.supportEmail = ''
    config.social.github = value
    expect(getSocialLinks(config, 'zh')).toEqual([])
  })

  it('非法社交地址不输出，合法 HTTPS 与邮箱输出', () => {
    const config = createConfig()
    config.social = { github: 'https://github.com/jerbix', x: 'javascript:alert(1)' }
    config.mail.supportEmail = ['support', 'jerbix.dev'].join('@')
    const items = getSocialLinks(config, 'zh')
    expect(items.map((item) => item.id)).toEqual(['github', 'support'])
    expect(items.map((item) => item.destination)).toEqual([
      { kind: 'external', href: 'https://github.com/jerbix', newTab: true },
      { kind: 'external', href: `mailto:${config.mail.supportEmail}`, newTab: false },
    ])
    expect(
      items.every((item) => typeof item.icon === 'object' || typeof item.icon === 'function'),
    ).toBe(true)
  })

  it('固定遍历全部 11 个平台并保留技术名与对应图标', () => {
    const config = createConfig()
    // 只断言社交平台：支持邮箱会额外产生一条 support 链接，单独有用例覆盖。
    config.mail.supportEmail = ''
    const platforms = [
      'github',
      'x',
      'bluesky',
      'mastodon',
      'discord',
      'youtube',
      'linkedin',
      'facebook',
      'instagram',
      'tiktok',
      'telegram',
    ] as const
    for (const platform of [...platforms].reverse()) {
      config.social[platform] = `https://${platform}.example/jerbix`
    }
    const items = getSocialLinks(config, 'en')
    expect(items.map((item) => item.id)).toEqual(platforms)
    expect(items.map((item) => item.title)).toEqual([
      'GitHub',
      'X',
      'Bluesky',
      'Mastodon',
      'Discord',
      'YouTube',
      'LinkedIn',
      'Facebook',
      'Instagram',
      'TikTok',
      'Telegram',
    ])
    expect(items.every((item) => item.icon !== undefined)).toBe(true)
    expect(new Set(items.map((item) => item.icon)).size).toBe(11)
  })

  it.each([
    '',
    ' ',
    'invalid',
    'support@',
    'support@example.com?subject=test',
    'a\r\nb@example.com',
  ])('无效或空邮箱 %s 不生成 support', (supportEmail) => {
    const config = createConfig()
    config.mail.supportEmail = supportEmail
    expect(getSocialLinks(config, 'en')).toEqual([])
  })

  it('合法支持邮箱生成 support 链接', () => {
    const config = createConfig()
    config.mail.supportEmail = ['support', 'jerbix.dev'].join('@')
    const items = getSocialLinks(config, 'en')
    expect(items.map((item) => item.id)).toEqual(['support'])
    expect(items[0]?.destination).toEqual({
      kind: 'external',
      href: `mailto:${config.mail.supportEmail}`,
      newTab: false,
    })
  })

  it('合法 HTTPS query / hash 原样保留', () => {
    const href = 'https://example.com/profile?tab=posts#latest'
    expect(isSafeSocialUrl(href)).toBe(true)
    const config = createConfig()
    config.social.github = href
    expect(getSocialLinks(config, 'zh')[0]?.destination).toEqual({
      kind: 'external',
      href,
      newTab: true,
    })
  })
})
