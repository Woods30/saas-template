import type { TablerIcon } from '@tabler/icons-react'
import { type LinkOptions, linkOptions } from '@tanstack/react-router'
import type { Locale } from '@/lib/locale'
import type { SiteModule, WebsiteConfig } from './website'

export type PublicTarget =
  | 'home'
  | 'docs'
  | 'blog'
  | 'changelog'
  | 'pricing'
  | 'contact'
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
      return linkOptions({ to: '/{-$locale}/pricing', params: { locale } })
    case 'contact':
      return linkOptions({ to: '/{-$locale}/contact', params: { locale } })
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
  // 功能开关（`features.*`）与服务模块（`mail`/`docs`/...）是两套：后者有 `.enabled`
  // 字段，前者本身就是布尔值。菜单项按功能开关过滤时必须走 `features[flag]`。
  feature?: keyof WebsiteConfig['features']
  authenticated?: boolean
  roles?: readonly string[]
}
type Common = { id: string; visibility?: MenuVisibility }
type Label = { title: string; description?: string; icon?: TablerIcon }
export type MenuLinkItem = Common &
  Label & {
    kind: 'link'
    destination:
      | {
          kind: 'internal'
          // 不写死为 `getPublicLinkOptions` 的返回类型：那是公共导航目标的封闭联合，
          // 工作台等区域导航（如 `/dashboard/*`）同样是站内链接，却不在该联合里。
          // `LinkOptions` 是 `Link` 的 props 类型，`linkOptions()` 的返回值可赋给它。
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
