import {
  IconBell,
  IconDeviceLaptop,
  IconShieldLock,
  IconUser,
  type TablerIcon,
} from '@tabler/icons-react'
import { linkOptions } from '@tanstack/react-router'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { filterMenuItems, type MenuContext, type MenuLinkItem } from './navigation'

/** 个人中心板块的标识，同时作为路由段与菜单 id。 */
export type SettingsSection = 'profile' | 'security' | 'sessions' | 'notifications'

/**
 * 个人中心侧边栏的导航项工厂。
 *
 * 与 `src/config/navbar-config.ts` 同风格：文案在**调用时**用 `m.*()` 求值，因此随请求
 * 语言变化；门禁交给 `filterMenuItems`，通知偏好项依赖 `newsletter` 模块，模块关闭时
 * 该项自动消失（路由本身仍在，只是不出现入口）。
 */
export function getSettingsSections(locale: Locale, ctx: MenuContext) {
  const items: readonly MenuLinkItem[] = [
    {
      kind: 'link',
      id: 'profile',
      title: m.settings_nav_profile(),
      icon: IconUser,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/dashboard/profile', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'security',
      title: m.settings_nav_security(),
      icon: IconShieldLock,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/dashboard/security', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'sessions',
      title: m.settings_nav_sessions(),
      icon: IconDeviceLaptop,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/dashboard/sessions', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'notifications',
      title: m.settings_nav_notifications(),
      icon: IconBell,
      visibility: { module: 'newsletter' },
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/dashboard/notifications', params: { locale } }),
      },
    },
  ]
  return filterMenuItems(items, ctx) as MenuLinkItem[]
}

/** 每个板块的标题与说明，供页面 `head()` 与内容区标题使用。 */
export function getSettingsSectionMeta(section: SettingsSection): {
  title: string
  description: string
  icon: TablerIcon
} {
  switch (section) {
    case 'profile':
      return {
        title: m.settings_profile_title(),
        description: m.settings_profile_description(),
        icon: IconUser,
      }
    case 'security':
      return {
        title: m.settings_security_title(),
        description: m.settings_security_description(),
        icon: IconShieldLock,
      }
    case 'sessions':
      return {
        title: m.settings_sessions_title(),
        description: m.settings_sessions_description(),
        icon: IconDeviceLaptop,
      }
    case 'notifications':
      return {
        title: m.settings_notifications_title(),
        description: m.settings_notifications_description(),
        icon: IconBell,
      }
  }
}
