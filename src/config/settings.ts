import {
  IconBell,
  IconChartBar,
  IconClipboardList,
  IconCoins,
  IconCreditCard,
  IconDeviceLaptop,
  IconFileText,
  IconKey,
  IconMessage2,
  IconReceipt,
  IconRepeat,
  IconScan,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconUser,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react'
import { linkOptions } from '@tanstack/react-router'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { filterMenuItems, type MenuContext, type MenuItem, type MenuLinkItem } from './navigation'

export interface AdminCollapsibleGroup {
  id: string
  title: string
  icon: TablerIcon
  items: MenuLinkItem[]
}

export interface AdminSidebarMenu {
  groupTitle: string
  overviewItem: MenuLinkItem
  collapsibleGroups: AdminCollapsibleGroup[]
  footerItems: MenuLinkItem[]
}

/** 个人中心板块的标识，同时作为路由段与菜单 id。 */
export type SettingsSection =
  | 'profile'
  | 'security'
  | 'sessions'
  | 'notifications'
  | 'api-keys'
  | 'billing'
  /** 管理台根页（营收总览）；子页面路径含两段，与个人中心的单段不同。 */
  | 'admin'
  | 'admin/users'
  | 'admin/roles'
  | 'admin/orders'
  | 'admin/subscriptions'
  | 'admin/credits'
  | 'admin/tasks'
  | 'admin/content'
  | 'admin/tickets'
  | 'admin/audit'

/**
 * 个人中心（`/settings/*`）侧边栏的导航项工厂。
 *
 * 只描述个人菜单：管理台是另一棵路由树，菜单由 `getAdminSidebarMenu` 单独给出，
 * 不再塞进这里靠角色过滤。文案在**调用时**用 `m.*()` 求值以跟随请求语言；
 * 门禁交给 `filterMenuItems`，空分组会被摘掉。
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
            options: linkOptions({ to: '/{-$locale}/settings/profile', params: { locale } }),
          },
        },
        {
          kind: 'link',
          id: 'security',
          title: m.settings_nav_security(),
          icon: IconShieldLock,
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/settings/security', params: { locale } }),
          },
        },
        {
          kind: 'link',
          id: 'sessions',
          title: m.settings_nav_sessions(),
          icon: IconDeviceLaptop,
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/settings/sessions', params: { locale } }),
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
            options: linkOptions({ to: '/{-$locale}/settings/notifications', params: { locale } }),
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
            options: linkOptions({ to: '/{-$locale}/settings/billing', params: { locale } }),
          },
        },
        {
          kind: 'link',
          id: 'collection-orders',
          title: m['collection.nav_orders'](),
          icon: IconReceipt,
          // 核销型支付与 payment 是平级模块：模块关闭时入口消失，页面另有门禁。
          visibility: { module: 'collection' },
          destination: {
            kind: 'internal',
            options: linkOptions({ to: '/{-$locale}/settings/orders', params: { locale } }),
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
            options: linkOptions({ to: '/{-$locale}/settings/api-keys', params: { locale } }),
          },
        },
      ],
    },
  ]
  return filterMenuItems(items, ctx)
}

/**
 * 独立管理台（`/admin/*`）的树形侧栏导航。
 *
 * 对齐 ShipAny 管理台侧栏结构：
 * - 顶部单列「营收与订阅」（概览）
 * - 三组可折叠子菜单：「用户与权限」「账单与财务」「内容与运营」
 * - 侧栏底部：「系统设置」与「个人中心」快速切换入口
 */
export function getAdminSidebarMenu(locale: Locale, ctx: MenuContext): AdminSidebarMenu | null {
  if (!ctx.authenticated || ctx.role !== 'admin' || !ctx.config.features.enableAdmin) {
    return null
  }

  const overviewItem: MenuLinkItem = {
    kind: 'link',
    id: 'admin-revenue',
    title: m.settings_nav_admin_revenue(),
    icon: IconChartBar,
    destination: {
      kind: 'internal',
      options: linkOptions({ to: '/{-$locale}/admin', params: { locale } }),
    },
  }

  const rbacItems: MenuLinkItem[] = [
    {
      kind: 'link',
      id: 'admin',
      title: m.settings_nav_admin(),
      icon: IconUsers,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/users', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'admin-roles',
      title: m.settings_nav_admin_roles(),
      icon: IconShieldLock,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/roles', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'admin-audit',
      title: m.settings_nav_admin_audit(),
      icon: IconClipboardList,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/audit', params: { locale } }),
      },
    },
  ]

  const billingItems: MenuLinkItem[] = [
    {
      kind: 'link',
      id: 'admin-orders',
      title: m.settings_nav_admin_orders(),
      icon: IconReceipt,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/orders', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'admin-subscriptions',
      title: m.settings_nav_admin_subscriptions(),
      icon: IconRepeat,
      destination: {
        kind: 'internal',
        options: linkOptions({
          to: '/{-$locale}/admin/subscriptions',
          params: { locale },
        }),
      },
    },
    ...(ctx.config.collection.enabled
      ? [
          {
            kind: 'link' as const,
            id: 'admin-collection-orders',
            title: m['collection_admin.nav_orders'](),
            icon: IconScan,
            destination: {
              kind: 'internal' as const,
              options: linkOptions({
                to: '/{-$locale}/admin/collection-orders',
                params: { locale },
              }),
            },
          },
        ]
      : []),
    {
      kind: 'link',
      id: 'admin-credits',
      title: m.settings_nav_admin_credits(),
      icon: IconCoins,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/credits', params: { locale } }),
      },
    },
  ]

  const contentItems: MenuLinkItem[] = [
    {
      kind: 'link',
      id: 'admin-content',
      title: m.settings_nav_admin_content(),
      icon: IconFileText,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/content', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'admin-tickets',
      title: m.settings_nav_admin_tickets(),
      icon: IconMessage2,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/tickets', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'admin-tasks',
      title: m.settings_nav_admin_tasks(),
      icon: IconSparkles,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/tasks', params: { locale } }),
      },
    },
  ]

  const footerItems: MenuLinkItem[] = [
    {
      kind: 'link',
      id: 'admin-settings',
      title: m.settings_nav_admin_settings(),
      icon: IconSettings,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/admin/settings', params: { locale } }),
      },
    },
    {
      kind: 'link',
      id: 'personal-switch',
      title: m.settings_title(),
      icon: IconUser,
      destination: {
        kind: 'internal',
        options: linkOptions({ to: '/{-$locale}/settings/profile', params: { locale } }),
      },
    },
  ]

  return {
    groupTitle: m.settings_group_admin(),
    overviewItem,
    collapsibleGroups: [
      { id: 'rbac', title: m.admin_nav_group_rbac(), icon: IconShieldLock, items: rbacItems },
      {
        id: 'billing',
        title: m.admin_nav_group_billing(),
        icon: IconCreditCard,
        items: billingItems,
      },
      {
        id: 'content',
        title: m.admin_nav_group_content(),
        icon: IconFileText,
        items: contentItems,
      },
    ],
    footerItems,
  }
}

/** 每个板块的标题与说明，供页面 `head()` 与内容区标题使用。 */
/**
 * 每个板块的标题与说明，供页面 `head()` 与内容区标题使用。
 *
 * 参数是**路径段**（`profile`、`admin`），未注册时返回 `undefined`，
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
    case 'orders':
      return {
        title: m['collection.order_list_title'](),
        description: m['collection.order_list_description'](),
        icon: IconReceipt,
      }
    case 'admin/users':
      return {
        title: m.settings_admin_title(),
        description: m.settings_admin_description(),
        icon: IconUsers,
      }
    case 'admin':
      return {
        title: m.admin_revenue_title(),
        description: m.admin_revenue_description(),
        icon: IconChartBar,
      }
    case 'admin/orders':
      return {
        title: m.admin_orders_title(),
        description: m.admin_orders_description(),
        icon: IconReceipt,
      }
    case 'admin/subscriptions':
      return {
        title: m.admin_subscriptions_title(),
        description: m.admin_subscriptions_description(),
        icon: IconRepeat,
      }
    case 'admin/credits':
      return {
        title: m.admin_credits_title(),
        description: m.admin_credits_description(),
        icon: IconCoins,
      }
    case 'admin/roles':
      return {
        title: m.admin_roles_title(),
        description: m.admin_roles_description(),
        icon: IconShieldLock,
      }
    case 'admin/tasks':
      return {
        title: m.admin_tasks_title(),
        description: m.admin_tasks_description(),
        icon: IconSparkles,
      }
    case 'admin/content':
      return {
        title: m.admin_content_title(),
        description: m.admin_content_description(),
        icon: IconFileText,
      }
    case 'admin/tickets':
      return {
        title: m.admin_tickets_title(),
        description: m.admin_tickets_description(),
        icon: IconMessage2,
      }
    case 'admin/audit':
      return {
        title: m.admin_audit_title(),
        description: m.admin_audit_description(),
        icon: IconClipboardList,
      }
    case 'admin/collection-orders':
      return {
        title: m['collection_admin.title_orders'](),
        description: m['collection_admin.description_orders'](),
        icon: IconScan,
      }
    case 'admin/settings':
      return {
        title: m.admin_settings_title(),
        description: m.admin_settings_description(),
        icon: IconSettings,
      }
  }
}
