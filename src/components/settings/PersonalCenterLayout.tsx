import { IconShieldLock } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  DashboardShell,
  SIDEBAR_ITEM_CLASS,
  toSectionMeta,
  useSectionPath,
} from '@/components/dashboard/DashboardShell'
import { canEnterAdmin } from '@/components/layout/account-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { navLabel } from '@/config/navigation'
import { adminRoutes, settingsRoutes } from '@/config/routes'
import { findSettingsNavItem, getSettingsNav, isSettingsNavActive } from '@/config/settings-nav'
import { websiteConfig } from '@/config/website'
import type { SessionInfo } from '@/core/auth/session'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 个人中心布局（`/settings/*`）。
 *
 * 只渲染个人菜单；管理员额外拿到侧栏底部的「管理后台」入口。
 * 会话由路由 `beforeLoad` 校验，这里不再兜底判断。
 */
export function PersonalCenterLayout({
  locale,
  session,
  children,
}: {
  locale: Locale
  session: SessionInfo
  children: ReactNode
}) {
  const section = useSectionPath('settings')
  const items = getSettingsNav(websiteConfig)
  const meta = toSectionMeta(findSettingsNavItem(section))
  const canSwitchToAdmin = canEnterAdmin(session.permissions)

  return (
    <DashboardShell
      locale={locale}
      session={session}
      meta={meta}
      // 详情页（`orders/<id>`）自带标题，避免与布局标题重复。
      hidePageHeader={section.includes('/')}
      root={{ label: m.settings_title(), to: settingsRoutes.profile }}
      sidebar={
        <SidebarGroup>
          <SidebarGroupLabel>{m.settings_group_personal()}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    render={<Link to={item.to} params={{ locale }} />}
                    isActive={isSettingsNavActive(item, section)}
                    tooltip={navLabel(item)}
                    className={SIDEBAR_ITEM_CLASS}
                  >
                    <item.icon aria-hidden />
                    <span>{navLabel(item)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
      footer={
        canSwitchToAdmin && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to={adminRoutes.overview} params={{ locale }} />}
                tooltip={m.admin_settings_feature_admin()}
                className={SIDEBAR_ITEM_CLASS}
              >
                <IconShieldLock aria-hidden />
                <span>{m.admin_settings_feature_admin()}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )
      }
    >
      {children}
    </DashboardShell>
  )
}
