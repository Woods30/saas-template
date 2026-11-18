import { IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  DashboardShell,
  SIDEBAR_ITEM_CLASS,
  toSectionMeta,
  useSectionPath,
} from '@/components/dashboard/DashboardShell'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  type AdminNavItem,
  findAdminNavItem,
  getAdminNav,
  isAdminNavActive,
} from '@/config/admin-nav'
import { navLabel } from '@/config/navigation'
import { adminRoutes } from '@/config/routes'
import { websiteConfig } from '@/config/website'
import type { SessionInfo } from '@/core/auth/session'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 管理台布局（`/admin/*`）。
 *
 * 树形侧栏：顶部单列「营收与订阅」概览，下接可折叠分组；底部「系统设置」与
 * 「个人中心」反向切换入口。非管理员由路由 `beforeLoad` 拦下，这里不再兜底判断。
 *
 * 标题与说明来自菜单配置（`config/admin-nav.ts`），面包屑与页面共用同一份文案。
 */
export function AdminConsoleLayout({
  locale,
  session,
  children,
}: {
  locale: Locale
  session: SessionInfo
  children: ReactNode
}) {
  const section = useSectionPath('admin')
  const nav = useMemo(() => getAdminNav(websiteConfig), [])
  // 详情页（若将来有）沿用所属列表页的标题。
  const meta = toSectionMeta(findAdminNavItem(nav, section.split('/')[0] ?? ''))

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(nav.groups.map((group) => group.id)),
  )

  /**
   * 命中当前路由的分组 id。
   *
   * 依赖是**字符串**而非菜单对象：分组收起后再点别的分组时能自动展开，
   * 同时用户在同一页手动收起的分组不会被立刻重开。
   */
  const activeGroupId = useMemo(
    () =>
      nav.groups.find((group) => group.items.some((item) => isAdminNavActive(item, section)))?.id ??
      null,
    [nav, section],
  )

  useEffect(() => {
    if (!activeGroupId) return
    setOpenGroups((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)))
  }, [activeGroupId])

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 路由 `beforeLoad` 已经拦过；这里再兜一层，避免有人绕过路由直接挂载布局。
  if (!websiteConfig.features.enableAdmin || session.user.role !== 'admin') return null

  return (
    <DashboardShell
      locale={locale}
      session={session}
      meta={meta}
      root={{ label: m.admin_settings_feature_admin(), to: adminRoutes.overview }}
      sidebar={
        <SidebarGroup>
          <SidebarGroupLabel>{m.settings_group_admin()}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavButton item={nav.overview} locale={locale} section={section} />
              </SidebarMenuItem>
              {nav.groups.map((group) => {
                const open = openGroups.has(group.id)
                const childActive = group.items.some((item) => isAdminNavActive(item, section))
                const GroupIcon = group.icon
                return (
                  <SidebarMenuItem key={group.id}>
                    <SidebarMenuButton
                      tooltip={group.label()}
                      isActive={childActive && !open}
                      aria-expanded={open}
                      onClick={() => toggleGroup(group.id)}
                      className={SIDEBAR_ITEM_CLASS}
                    >
                      <GroupIcon aria-hidden />
                      <span>{group.label()}</span>
                      <IconChevronRight
                        aria-hidden
                        className={`ml-auto size-4 shrink-0 text-sidebar-foreground/70 transition-transform ${
                          open ? 'rotate-90' : ''
                        }`}
                      />
                    </SidebarMenuButton>
                    {open && (
                      <SidebarMenuSub>
                        {group.items.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton
                              render={<Link to={item.to} params={{ locale }} />}
                              isActive={isAdminNavActive(item, section)}
                            >
                              <item.icon aria-hidden />
                              <span>{navLabel(item)}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
      footer={
        <SidebarMenu>
          {nav.footer.map((item) => (
            <SidebarMenuItem key={item.id}>
              <NavButton item={item} locale={locale} section={section} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      }
    >
      {children}
    </DashboardShell>
  )
}

/** 一级菜单按钮（概览与底部入口共用）。 */
function NavButton({
  item,
  locale,
  section,
}: {
  item: AdminNavItem
  locale: Locale
  section: string
}) {
  const Icon = item.icon
  return (
    <SidebarMenuButton
      render={<Link to={item.to} params={{ locale }} />}
      isActive={isAdminNavActive(item, section)}
      tooltip={navLabel(item)}
      className={SIDEBAR_ITEM_CLASS}
    >
      <Icon aria-hidden />
      <span>{navLabel(item)}</span>
    </SidebarMenuButton>
  )
}
