import {
  IconBell,
  IconChartBar,
  IconCreditCard,
  IconDeviceLaptop,
  IconKey,
  IconShieldLock,
  IconUser,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react'
import { linkOptions } from '@tanstack/react-router'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { filterMenuItems, type MenuContext, type MenuItem } from './navigation'

/** 个人中心板块的标识，同时作为路由段与菜单 id。 */
export type SettingsSection =
  | 'profile'
  | 'security'
  | 'sessions'
  | 'notifications'
  | 'api-keys'
  | 'billing'
  | 'admin'
  /** 管理分组下的子页面：路径含两段，与其它板块的单段不同。 */
  | 'admin/revenue'

/**
 * 个人中心侧边栏的导航项工厂。
 *
 * 文案在**调用时**用 `m.*()` 求值以跟随请求语言；门禁交给 `filterMenuItems`，
 * 空分组会被摘掉，因此非管理员不会看到一个空标题。
 */
export function getSettingsSections(locale: Locale, ctx: MenuContext): MenuItem[] {
  const items: readonly MenuItem[] = [
    {
      kind: 'group',
      id: 'personal',
      title: m.settings_group_personal(),
      items: [
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
        {
          kind: 'link',
          id: 'billing',
          title: m.settings_billing_nav(),
          icon: IconCreditCard,
          // 页面与 API 另有门禁，这里只控制入口是否显示。
          visibility: { module: 'payment' },
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/dashboard/billing', params: { locale } }),
          },
        },
        {
          kind: 'link',
          id: 'api-keys',
          title: m.settings_nav_api_keys(),
          icon: IconKey,
          // 功能开关，非服务模块；页面与 API 另有门禁。
          visibility: { feature: 'enableApiKeys' },
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/dashboard/api-keys', params: { locale } }),
          },
        },
      ],
    },
    {
      kind: 'group',
      id: 'admin',
      title: m.settings_group_admin(),
      items: [
        {
          kind: 'link',
          id: 'admin',
          title: m.settings_nav_admin(),
          icon: IconUsers,
          // 角色 + 功能开关双重约束：两者都满足才显示。
          visibility: { roles: ['admin'], feature: 'enableAdmin' },
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/dashboard/admin/users', params: { locale } }),
          },
        },
        {
          kind: 'link',
          id: 'admin-revenue',
          title: m.settings_nav_admin_revenue(),
          icon: IconChartBar,
          // 与用户管理同一套约束：角色 + 功能开关都满足才显示。
          visibility: { roles: ['admin'], feature: 'enableAdmin' },
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/dashboard/admin/revenue', params: { locale } }),
          },
        },
      ],
    },
  ]
  return filterMenuItems(items, ctx)
}

/** 每个板块的标题与说明，供页面 `head()` 与内容区标题使用。 */
/**
 * 每个板块的标题与说明，供页面 `head()` 与内容区标题使用。
 *
 * 参数是**路径段**（`profile`、`admin/revenue`），未注册时返回 `undefined`，
 * 调用方据此退回到更粗的层级。
 */
export function getSettingsSectionMeta(section: string):
  | {
      title: string
      description: string
      icon: TablerIcon
    }
  | undefined {
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
    case 'api-keys':
      return {
        title: m.settings_api_keys_title(),
        description: m.settings_api_keys_description(),
        icon: IconKey,
      }
    case 'billing':
      return {
        title: m.settings_billing_title(),
        description: m.settings_billing_description(),
        icon: IconCreditCard,
      }
    case 'admin':
      return {
        title: m.settings_admin_title(),
        description: m.settings_admin_description(),
        icon: IconUsers,
      }
    case 'admin/revenue':
      return {
        title: m.admin_revenue_title(),
        description: m.admin_revenue_description(),
        icon: IconChartBar,
      }
  }
}
