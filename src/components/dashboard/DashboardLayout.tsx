import { IconChevronRight, IconShieldLock } from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { DashboardUserCard } from '@/components/dashboard/DashboardUserCard'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { MenuLinkItem } from '@/config/navigation'
import { getAdminSidebarMenu, getSettingsSectionMeta, getSettingsSections } from '@/config/settings'
import { websiteConfig } from '@/config/website'
import { authClient } from '@/core/auth/client'
import type { SessionInfo } from '@/core/auth/session'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 个人中心与管理台的**两套独立外壳**。
 *
 * 两条路由树各自挂一个布局组件，入口由路由本身决定，不再在同一个布局里按路径
 * 判断「当前是不是管理台」：
 * - 个人中心（`/settings/*`）只渲染个人菜单，管理员在侧栏底部拿到「管理后台」切换入口；
 * - 管理台（`/admin/*`）渲染树形管理菜单与底部「系统设置 / 个人中心」切换入口。
 *
 * 侧栏折叠、cookie 持久化与窄屏 Sheet 都由 shadcn `sidebar` 原件负责；
 * 页面标题由面包屑末级承担，因此不渲染 `<h1>`；`DashboardUserCard` 是唯一的登出入口。
 */

/** 侧栏菜单项尺寸覆盖：原件 32px 行高在本仓 240px 侧栏里偏挤，这里放大到 40px。
 * 收起态原件 `size-8!` 带 important，覆盖时同样要带 `!`。 */
const SIDEBAR_ITEM_CLASS =
  'h-10 text-[0.9375rem] [&_svg]:size-[1.125rem] group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:[&_svg]:size-5'

/** 管理台可折叠分组默认全开；进入某页时再由 `useEffect` 展开命中的分组。 */
const ADMIN_GROUPS_DEFAULT_OPEN = ['rbac', 'billing', 'content']

/** 取菜单项指向的站内路径；外部链接返回 `null`。 */
function targetPathOf(item: MenuLinkItem): string | null {
  if (item.destination.kind !== 'internal') return null
  const options = item.destination.options
  return 'to' in options ? (options.to ?? null) : null
}

/**
 * 高亮按**目标路径**判定，而不是菜单 id。
 *
 * 菜单 id 与路由段并非一一对应：`admin` 分组下有 `users` 与 `revenue` 两个子页，
 * 只按第一段匹配会让两个菜单项同时命中或都不命中（用户管理抢走高亮）。
 * `base` 是当前布局所属的路由段，用于把完整路径裁成布局内的相对段。
 */
function isLinkActive(
  item: MenuLinkItem,
  base: 'admin' | 'settings',
  currentPath: string,
): boolean {
  const target = targetPathOf(item)
  if (target === null) return false
  return (target.split(`/${base}/`)[1] ?? '') === currentPath
}

/** 路径在布局内的相对段：`/zh/admin` → `revenue`。 */
function useSectionPath(base: 'admin' | 'settings'): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return pathname.split(`/${base}/`)[1] ?? ''
}

/** 管理员才有管理台入口：角色 + 功能开关双重约束。 */
function canEnterAdmin(session: SessionInfo): boolean {
  return websiteConfig.features.enableAdmin && session.user.role === 'admin'
}

/**
 * 个人中心布局（`/settings/*`）。
 *
 * 只读个人菜单；管理员额外拿到侧栏底部的「管理后台」入口。
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
  const currentPath = useSectionPath('settings')
  const groups = getSettingsSections(locale, {
    config: websiteConfig,
    authenticated: true,
    role: session.user.role,
  }).filter((group) => group.kind === 'group' && group.id === 'personal')
  const meta = getSettingsSectionMeta(currentPath.split('/')[0] ?? '')

  return (
    <DashboardShell
      locale={locale}
      session={session}
      meta={meta}
      root={{ label: m.settings_title(), to: '/{-$locale}/settings/profile' }}
      sidebar={groups.map((group) => {
        if (group.kind !== 'group') return null
        return (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (item.kind !== 'link') return null
                  const options =
                    item.destination.kind === 'internal' ? item.destination.options : null
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        render={options ? <Link {...options} /> : undefined}
                        isActive={isLinkActive(item, 'settings', currentPath)}
                        tooltip={item.title}
                        className={SIDEBAR_ITEM_CLASS}
                      >
                        {Icon && <Icon aria-hidden />}
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
      footer={
        canEnterAdmin(session) && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/{-$locale}/admin" params={{ locale }} />}
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

/**
 * 管理台布局（`/admin/*`）。
 *
 * 树形菜单：顶部单列「营收与订阅」概览，下接可折叠分组；底部「系统设置」与
 * 「个人中心」反向切换入口。非管理员由路由 `beforeLoad` 拦下，这里不再兜底判断。
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
  const currentPath = useSectionPath('admin')
  const role = session.user.role
  // 菜单结构只随语言与角色变化；每次渲染新建对象会让下面的 effect 反复重跑。
  const menu = useMemo(
    () => getAdminSidebarMenu(locale, { config: websiteConfig, authenticated: true, role }),
    [locale, role],
  )
  // 根页（`/admin`）就是营收总览，段为空时用同一个标题，不吃掉末级面包屑。
  const meta = getSettingsSectionMeta(
    currentPath === '' ? 'admin' : `admin/${currentPath.split('/')[0] ?? ''}`,
  )

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(ADMIN_GROUPS_DEFAULT_OPEN),
  )

  /**
   * 命中当前路由的分组 id。
   *
   * 依赖是**字符串**而非菜单对象：菜单对象即使 memo 过，也会随语言/角色重建；
   * 用字符串做依赖能保证只有「换到另一个分组」时才自动展开，用户在同一页手动
   * 收起的分组不会被立刻重开。
   */
  const activeGroupId = useMemo(
    () =>
      menu?.collapsibleGroups.find((group) =>
        group.items.some((item) => isLinkActive(item, 'admin', currentPath)),
      )?.id ?? null,
    [menu, currentPath],
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

  if (!menu) return null

  const overviewOptions =
    menu.overviewItem.destination.kind === 'internal' ? menu.overviewItem.destination.options : null
  const OverviewIcon = menu.overviewItem.icon

  return (
    <DashboardShell
      locale={locale}
      session={session}
      meta={meta}
      root={{ label: m.admin_settings_feature_admin(), to: '/{-$locale}/admin' }}
      sidebar={
        <SidebarGroup>
          <SidebarGroupLabel>{menu.groupTitle}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={overviewOptions ? <Link {...overviewOptions} /> : undefined}
                  isActive={isLinkActive(menu.overviewItem, 'admin', currentPath)}
                  tooltip={menu.overviewItem.title}
                  className={SIDEBAR_ITEM_CLASS}
                >
                  {OverviewIcon && <OverviewIcon aria-hidden />}
                  <span>{menu.overviewItem.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {menu.collapsibleGroups.map((group) => {
                const open = openGroups.has(group.id)
                const childActive = group.items.some((item) =>
                  isLinkActive(item, 'admin', currentPath),
                )
                const GroupIcon = group.icon
                return (
                  <SidebarMenuItem key={group.id}>
                    <SidebarMenuButton
                      tooltip={group.title}
                      isActive={childActive && !open}
                      aria-expanded={open}
                      onClick={() => toggleGroup(group.id)}
                      className={SIDEBAR_ITEM_CLASS}
                    >
                      <GroupIcon aria-hidden />
                      <span>{group.title}</span>
                      <IconChevronRight
                        aria-hidden
                        className={`ml-auto size-4 shrink-0 text-sidebar-foreground/70 transition-transform ${
                          open ? 'rotate-90' : ''
                        }`}
                      />
                    </SidebarMenuButton>
                    {open && (
                      <SidebarMenuSub>
                        {group.items.map((item) => {
                          const options =
                            item.destination.kind === 'internal' ? item.destination.options : null
                          const Icon = item.icon
                          return (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton
                                render={options ? <Link {...options} /> : undefined}
                                isActive={isLinkActive(item, 'admin', currentPath)}
                              >
                                {Icon && <Icon aria-hidden />}
                                <span>{item.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
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
          {menu.footerItems.map((item) => {
            const options = item.destination.kind === 'internal' ? item.destination.options : null
            const Icon = item.icon
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  render={options ? <Link {...options} /> : undefined}
                  isActive={isLinkActive(item, 'admin', currentPath)}
                  tooltip={item.title}
                  className={SIDEBAR_ITEM_CLASS}
                >
                  {Icon && <Icon aria-hidden />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      }
    >
      {children}
    </DashboardShell>
  )
}

/** 两个布局共用的外壳：侧栏框架、顶栏面包屑、模拟登录提示与内容容器。 */
function DashboardShell({
  locale,
  session,
  meta,
  root,
  sidebar,
  footer,
  children,
}: {
  locale: Locale
  session: SessionInfo
  meta: ReturnType<typeof getSettingsSectionMeta>
  root: { label: string; to: '/{-$locale}/admin' | '/{-$locale}/settings/profile' }
  sidebar: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarProvider>
      {/* 本主题 `--sidebar` 与 `--background` 同值，inset 面板的边界全靠
          `shadow-sm` 与顶栏那条 `--border` 细线读出，不是缺陷。 */}
      <Sidebar variant="inset" collapsible="icon">
        {/* 横版 logo 塞进 3rem 宽的收起态只有 18×5px，因此收起态换成方形图标。 */}
        <SidebarHeader>
          <Link
            to="/{-$locale}"
            params={{ locale }}
            aria-label={websiteConfig.metadata.name}
            className="flex items-center rounded-lg bg-logo-plate px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <BrandLogo className="text-2xl group-data-[collapsible=icon]:hidden" />
            <img
              src={websiteConfig.metadata.images.icon}
              alt=""
              width={128}
              height={128}
              className="hidden size-8 group-data-[collapsible=icon]:block"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>{sidebar}</SidebarContent>
        <SidebarFooter>
          {footer}
          <DashboardUserCard session={session} />
        </SidebarFooter>
      </Sidebar>
      {/* `min-w-0` 不能省：`SidebarInset` 是 flex item，默认 `min-width: auto`，
          宽表格的 min-content 宽度会撑出视口；允许收缩后由 `Table` 内部横向滚动。 */}
      <SidebarInset className="min-w-0">
        {/* 不加这条 `border-b`，浅色下浮起面板的顶边读不出来。 */}
        <header className="flex h-12 items-center gap-2 border-b px-4 md:px-6">
          {/* 窄屏侧栏是 Sheet 抽屉，同样靠这个按钮打开，因此宽窄屏都常驻。 */}
          <SidebarTrigger />
          {/* 末级带 aria-current="page"，即页面标题，因此不再渲染 <h1>。 */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/{-$locale}" params={{ locale }} />}>
                  {m.crumb_home()}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to={root.to} params={{ locale }} />}>
                  {root.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {meta && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{meta.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          {/* 窄屏主题切换收在抽屉底部的用户菜单里太深，顶栏补一个一步可达的入口。 */}
          <div className="ml-auto md:hidden">
            <ThemeToggle />
          </div>
        </header>
        {session.impersonating && <ImpersonationBanner />}
        {/* 用 `max-w-6xl` 而非表单页的 `max-w-3xl`：这里有 5–6 列的表格，3xl 会挤到换行。 */}
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * 模拟登录提示条。退出必须走 `stopImpersonating`，不要自己删 cookie——
 * 插件还维护着 `admin_session` 备份。
 */
function ImpersonationBanner() {
  const [busy, setBusy] = useState(false)

  async function stop() {
    setBusy(true)
    const { error } = await authClient.admin.stopImpersonating()
    setBusy(false)
    if (error) return
    // 身份已切回管理员，整页刷新让所有路由上下文按新会话重算。
    window.location.reload()
  }

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning"
    >
      <span>{m.settings_impersonating_banner()}</span>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void stop()}>
        {m.settings_impersonating_stop()}
      </Button>
    </div>
  )
}
