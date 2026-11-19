import {
  IconBell,
  IconCreditCard,
  IconDeviceLaptop,
  IconKey,
  IconReceipt,
  IconShieldLock,
  IconUser,
  type TablerIcon,
} from '@tabler/icons-react'
import { m } from '@/locale/paraglide/messages.js'
import type { NavCopy } from './navigation'
import { pathOf, type SettingsRoute, settingsRoutes } from './routes'
import type { WebsiteConfig } from './website'

/**
 * 个人中心（`/settings/*`）的导航项。
 *
 * 与左侧栏 1:1 对应，同时是页面标题与说明的唯一来源——侧栏、面包屑、
 * 页面 `<title>` 都读这里，不再各自维护一份文案。
 */
export interface SettingsNavItem extends NavCopy {
  id: string
  description: () => string
  icon: TablerIcon
  to: SettingsRoute
  /** 入口可见性。页面与 API 另有门禁，这里只决定菜单是否显示。 */
  visible?: (config: WebsiteConfig) => boolean
}

const SETTINGS_NAV: SettingsNavItem[] = [
  {
    id: 'profile',
    to: settingsRoutes.profile,
    icon: IconUser,
    title: () => m.settings_profile_title(),
    description: () => m.settings_profile_description(),
  },
  {
    id: 'security',
    to: settingsRoutes.security,
    icon: IconShieldLock,
    title: () => m.settings_security_title(),
    description: () => m.settings_security_description(),
  },
  {
    id: 'sessions',
    to: settingsRoutes.sessions,
    icon: IconDeviceLaptop,
    title: () => m.settings_sessions_title(),
    description: () => m.settings_sessions_description(),
  },
  {
    id: 'notifications',
    to: settingsRoutes.notifications,
    icon: IconBell,
    title: () => m.settings_notifications_title(),
    description: () => m.settings_notifications_description(),
    visible: (config) => config.newsletter.enabled && config.userFeatures.notifications,
  },
  {
    id: 'billing',
    to: settingsRoutes.billing,
    icon: IconCreditCard,
    title: () => m.settings_billing_title(),
    description: () => m.settings_billing_description(),
    visible: (config) => config.payment.enabled && config.userFeatures.billing,
  },
  {
    id: 'manual-payments',
    to: settingsRoutes.manualPayments,
    icon: IconReceipt,
    title: () => m['manual_payments.order_list_title'](),
    label: () => m['manual_payments.nav_orders'](),
    description: () => m['manual_payments.order_list_description'](),
    visible: (config) => config.manualPayments.enabled && config.userFeatures.manualPayments,
  },
  {
    id: 'api-keys',
    to: settingsRoutes.apiKeys,
    icon: IconKey,
    title: () => m.settings_api_keys_title(),
    description: () => m.settings_api_keys_description(),
    visible: (config) => config.userFeatures.apiKeys,
  },
]

/** 当前配置下可见的个人中心菜单项。 */
export function getSettingsNav(config: WebsiteConfig): SettingsNavItem[] {
  return SETTINGS_NAV.filter((item) => !item.visible || item.visible(config))
}

/**
 * 按路由段查页面元数据：`profile`、`orders`、`orders/<id>`。
 *
 * 二级路径取首段，详情页因此沿用列表页的标题与图标。
 */
export function findSettingsNavItem(section: string): SettingsNavItem | undefined {
  const head = section.split('/')[0] ?? ''
  return SETTINGS_NAV.find((item) => pathOf(item.to) === `/settings/${head}`)
}

/** 高亮判定：菜单项指向的路径是否就是当前页。 */
export function isSettingsNavActive(item: SettingsNavItem, section: string): boolean {
  return pathOf(item.to) === `/settings/${section}`
}
