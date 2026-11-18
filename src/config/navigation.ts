import type { TablerIcon } from '@tabler/icons-react'
import { type LinkOptions, linkOptions } from '@tanstack/react-router'
import type { Locale } from '@/lib/locale'
import type { SiteModule, WebsiteConfig } from './website'

/**
 * 受保护区域的菜单文案。
 *
 * 侧栏标签与页面标题绝大多数情况一致，因此 `label` 可省略、回落到 `title`；
 * 少数页面两处措辞不同（侧栏求短、标题求完整）时才单独给 `label`。
 */
export interface NavCopy {
  title: () => string
  label?: () => string
}

export function navLabel(item: NavCopy): string {
  return item.label?.() ?? item.title()
}

export type PublicTarget =
  | 'home'
  | 'docs'
  | 'blog'
  | 'changelog'
  | 'pricing'
  | 'contact'
  | 'roadmap'
  | 'waitlist'
  | 'login'
  | 'terms'
  | 'privacy'

export function getPublicLinkOptions(target: PublicTarget, locale: Locale, hash?: string) {
  switch (target) {
    case 'home':
      return linkOptions({ to: '/{-$locale}', params: { locale }, hash })
    case 'docs':
      return linkOptions({ to: '/{-$locale}/docs', params: { locale } })
    case 'blog':
      return linkOptions({ to: '/{-$locale}/marketing/blog', params: { locale } })
    case 'changelog':
      return linkOptions({ to: '/{-$locale}/marketing/changelog', params: { locale } })
    case 'pricing':
      return linkOptions({ to: '/{-$locale}', params: { locale }, hash: 'pricing' })
    case 'contact':
      return linkOptions({ to: '/{-$locale}/marketing/contact', params: { locale } })
    case 'roadmap':
      return linkOptions({ to: '/{-$locale}/marketing/roadmap', params: { locale } })
    case 'waitlist':
      return linkOptions({ to: '/{-$locale}/marketing/waitlist', params: { locale } })
    case 'login':
      return linkOptions({ to: '/{-$locale}/auth/login', params: { locale } })
    case 'terms':
      return linkOptions({
        to: '/{-$locale}/marketing/legal/$slug',
        params: { locale, slug: 'terms' },
      })
    case 'privacy':
      return linkOptions({
        to: '/{-$locale}/marketing/legal/$slug',
        params: { locale, slug: 'privacy' },
      })
  }
}

export type MenuVisibility = {
  module?: SiteModule
  // 功能开关与服务模块是两套：后者有 `.enabled`，前者本身就是布尔值。
  feature?: keyof WebsiteConfig['features']
  /** 静态营销页开关（`pages.*`）：没有服务模块，但可以按站点定位关闭。 */
  page?: keyof WebsiteConfig['pages']
  authenticated?: boolean
  roles?: readonly string[]
}

/**
 * 「文档」入口：文档站部署在外部时指向外链，否则指向站内 `/docs`。
 *
 * 外部文档站由 `docs.siteUrl` 表达。配了它就始终显示入口 —— 即使本仓关闭了
 * docs 模块，访客也要有地方可去；没配时入口跟随 docs 模块开关。
 */
export function getDocsMenuEntry(
  config: WebsiteConfig,
  locale: Locale,
): {
  visibility?: MenuVisibility
  destination: MenuLinkItem['destination']
} {
  const siteUrl = config.docs.siteUrl
  if (siteUrl) {
    return {
      destination: { kind: 'external', href: siteUrl, newTab: true },
    }
  }
  return {
    visibility: { module: 'docs' },
    destination: { kind: 'internal', options: getPublicLinkOptions('docs', locale) },
  }
}
type Common = { id: string; visibility?: MenuVisibility }
type Label = { title: string; description?: string; icon?: TablerIcon }
export type MenuLinkItem = Common &
  Label & {
    kind: 'link'
    destination:
      | {
          kind: 'internal'
          // 不用 `getPublicLinkOptions` 的返回类型：那是公共导航的封闭联合，
          // `/settings/*` 等站内链接不在其中。
          options: LinkOptions
        }
      | { kind: 'external'; href: string; newTab: boolean }
  }
export type MenuItem =
  | MenuLinkItem
  | (Common & Label & { kind: 'group'; items: readonly MenuItem[] })
  | (Common & { kind: 'separator' })
export type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }

export function filterMenuItems(items: readonly MenuItem[], ctx: MenuContext): MenuItem[] {
  const output: MenuItem[] = []
  for (const item of items) {
    const rule = item.visibility
    if (rule?.module && !ctx.config[rule.module].enabled) continue
    if (rule?.feature && !ctx.config.features[rule.feature]) continue
    if (rule?.page && !ctx.config.pages[rule.page]) continue
    if (rule?.authenticated !== undefined && rule.authenticated !== ctx.authenticated) continue
    if (rule?.roles && (!ctx.authenticated || !ctx.role || !rule.roles.includes(ctx.role))) continue
    const next = item.kind === 'group' ? { ...item, items: filterMenuItems(item.items, ctx) } : item
    if (next.kind === 'group' && next.items.length === 0) continue
    if (next.kind === 'separator' && (!output.length || output.at(-1)?.kind === 'separator'))
      continue
    output.push(next)
  }
  if (output.at(-1)?.kind === 'separator') output.pop()
  return output
}
