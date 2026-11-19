import {
  IconChartBar,
  IconClipboardList,
  IconCoins,
  IconCreditCard,
  IconFileText,
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
import { m } from '@/locale/paraglide/messages.js'
import type { NavCopy } from './navigation'
import { type AppRoute, adminRoutes, pathOf, sectionOf, settingsRoutes } from './routes'
import type { WebsiteConfig } from './website'

/**
 * 管理台（`/admin/*`）的树形侧栏导航。
 *
 * 菜单项同时是**页面元数据的唯一来源**：标题、说明、图标只在这里写一次，
 * 侧栏、面包屑与 `<title>` 都从同一份数据取，不再各写一套文案。
 *
 * 权限由路由 `beforeLoad` 保证（非管理员根本进不来），因此这里不做角色过滤，
 * 只按模块开关决定是否出现核销订单入口。
 */
export interface AdminNavItem extends NavCopy {
  /** 路由段，同时作为 DOM key 与测试锚点。 */
  id: string
  description: () => string
  icon: TablerIcon
  to: AppRoute
}

export interface AdminNavGroup {
  id: string
  /** 分组在侧栏里的文案；分组本身没有对应页面，因此没有标题元数据。 */
  label: () => string
  icon: TablerIcon
  items: AdminNavItem[]
}

export interface AdminNav {
  overview: AdminNavItem
  groups: AdminNavGroup[]
  /** 侧栏底部：系统设置 + 切回个人中心。 */
  footer: AdminNavItem[]
}

const OVERVIEW: AdminNavItem = {
  id: 'revenue',
  to: adminRoutes.overview,
  icon: IconChartBar,
  title: () => m.admin_revenue_title(),
  description: () => m.admin_revenue_description(),
}

const RBAC_ITEMS: AdminNavItem[] = [
  {
    id: 'users',
    to: adminRoutes.users,
    icon: IconUsers,
    title: () => m.settings_admin_title(),
    description: () => m.settings_admin_description(),
  },
  {
    id: 'roles',
    to: adminRoutes.roles,
    icon: IconShieldLock,
    title: () => m.admin_roles_title(),
    description: () => m.admin_roles_description(),
  },
  {
    id: 'audit',
    to: adminRoutes.audit,
    icon: IconClipboardList,
    title: () => m.admin_audit_title(),
    description: () => m.admin_audit_description(),
  },
]

const MANUAL_PAYMENT_ORDERS: AdminNavItem = {
  id: 'manual-payments',
  to: adminRoutes.manualPayments,
  icon: IconScan,
  title: () => m['manual_payments_admin.title_orders'](),
  label: () => m['manual_payments_admin.nav_orders'](),
  description: () => m['manual_payments_admin.description_orders'](),
}

const BILLING_ITEMS: AdminNavItem[] = [
  {
    id: 'payments',
    to: adminRoutes.payments,
    icon: IconReceipt,
    title: () => m.admin_payments_title(),
    description: () => m.admin_payments_description(),
  },
  {
    id: 'subscriptions',
    to: adminRoutes.subscriptions,
    icon: IconRepeat,
    title: () => m.admin_subscriptions_title(),
    description: () => m.admin_subscriptions_description(),
  },
  {
    id: 'credits',
    to: adminRoutes.credits,
    icon: IconCoins,
    title: () => m.admin_credits_title(),
    description: () => m.admin_credits_description(),
  },
]

const CONTENT_ITEMS: AdminNavItem[] = [
  {
    id: 'content',
    to: adminRoutes.content,
    icon: IconFileText,
    title: () => m.admin_content_title(),
    description: () => m.admin_content_description(),
  },
  {
    id: 'tickets',
    to: adminRoutes.tickets,
    icon: IconMessage2,
    title: () => m.admin_tickets_title(),
    description: () => m.admin_tickets_description(),
  },
  {
    id: 'tasks',
    to: adminRoutes.tasks,
    icon: IconSparkles,
    title: () => m.admin_tasks_title(),
    description: () => m.admin_tasks_description(),
  },
]

const SETTINGS_ITEM: AdminNavItem = {
  id: 'settings',
  to: adminRoutes.settings,
  icon: IconSettings,
  title: () => m.admin_settings_title(),
  description: () => m.admin_settings_description(),
}

const PERSONAL_SWITCH: AdminNavItem = {
  id: 'personal-switch',
  to: settingsRoutes.profile,
  icon: IconUser,
  title: () => m.settings_title(),
  description: () => '',
}

/** 组装管理台菜单；核销订单只在 manualPayments 模块开启时出现。 */
export function getAdminNav(config: WebsiteConfig): AdminNav {
  return {
    overview: OVERVIEW,
    groups: [
      {
        id: 'rbac',
        label: () => m.admin_nav_group_rbac(),
        icon: IconShieldLock,
        items: RBAC_ITEMS,
      },
      {
        id: 'billing',
        label: () => m.admin_nav_group_billing(),
        icon: IconCreditCard,
        items: config.manualPayments.enabled
          ? [...BILLING_ITEMS.slice(0, 2), MANUAL_PAYMENT_ORDERS, ...BILLING_ITEMS.slice(2)]
          : BILLING_ITEMS,
      },
      {
        id: 'content',
        label: () => m.admin_nav_group_content(),
        icon: IconFileText,
        items: CONTENT_ITEMS,
      },
    ],
    footer: [SETTINGS_ITEM, PERSONAL_SWITCH],
  }
}

/** 全部管理台菜单项（不含分组本身）。 */
function allAdminItems(nav: AdminNav): AdminNavItem[] {
  return [nav.overview, ...nav.groups.flatMap((group) => group.items), ...nav.footer]
}

/**
 * 按路由段查页面元数据：`users`、`''`（根页营收总览）。
 *
 * 未注册的段（例如将来的详情页）返回 `undefined`，调用方据此少渲染一级面包屑。
 */
export function findAdminNavItem(nav: AdminNav, section: string): AdminNavItem | undefined {
  return allAdminItems(nav).find((item) => sectionOf(item.to, 'admin') === section)
}

/** 高亮判定：菜单项指向的路径是否就是当前页。 */
export function isAdminNavActive(item: AdminNavItem, section: string): boolean {
  const target = pathOf(item.to)
  return target === (section ? `/admin/${section}` : '/admin')
}
