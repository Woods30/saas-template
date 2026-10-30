import { Link, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { authClient } from '@/auth/client'
import type { SessionInfo } from '@/auth/session'
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
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { getSettingsSectionMeta, getSettingsSections } from '@/config/settings'
import { websiteConfig } from '@/config/website'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 个人中心外壳。侧栏直接用 shadcn `sidebar`（Base UI 版），折叠、cookie 持久化
 * 与窄屏抽屉都由原件负责；菜单项来自 `src/config/settings.ts`。页面标题由面包屑
 * 末级承担，因此不渲染 `<h1>`；`DashboardUserCard` 是本路由内唯一的登出入口。
 */
/** 侧栏菜单项尺寸覆盖：原件 32px 行高在本仓 240px 侧栏里偏挤，这里放大到 40px。
 * 收起态原件 `size-8!` 带 important，覆盖时同样要带 `!`。 */
const SIDEBAR_ITEM_CLASS =
  'h-10 text-[0.9375rem] [&_svg]:size-[1.125rem] group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:[&_svg]:size-5'

export function DashboardLayout({
  locale,
  session,
  children,
}: {
  locale: Locale
  session: SessionInfo
  children: ReactNode
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const groups = getSettingsSections(locale, {
    config: websiteConfig,
    authenticated: true,
    role: session.user.role,
  })
  // 当前板块取 `/dashboard/` 之后的一段；未注册的板块匹配不到，面包屑退化为两级。
  const currentSection = pathname.split('/dashboard/')[1]?.split('/')[0]
  /**
   * 高亮按**目标路径**判定，而不是菜单 id。
   *
   * 菜单 id 与路由段并非一一对应：`admin` 分组下有 `admin/users` 与 `admin/revenue`
   * 两个子页，只按第一段匹配会让两个菜单项同时命中或都不命中（用户管理抢走高亮）。
   */
  const currentDashboardPath = pathname.split('/dashboard/')[1] ?? ''
  // 面包屑末级优先用完整路径（`admin/revenue`），匹配不到再退回第一段（`admin`）。
  const currentMeta =
    getSettingsSectionMeta(currentDashboardPath) ?? getSettingsSectionMeta(currentSection ?? '')

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
            <BrandLogo className="w-36 group-data-[collapsible=icon]:hidden" />
            <img
              src={websiteConfig.metadata.images.icon}
              alt=""
              width={128}
              height={128}
              className="hidden size-8 group-data-[collapsible=icon]:block"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => {
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
                      // 按目标路径判定：菜单 id 与路由段不是一一对应（`admin` 分组下有
                      // `admin/users` 与 `admin/revenue` 两个子页），按 id 匹配会让
                      // 「用户管理」抢走「营收与订阅」的高亮。
                      const targetPath =
                        options !== null && 'to' in options ? (options.to ?? '') : ''
                      const isActive =
                        targetPath !== '' &&
                        (targetPath.split('/dashboard/')[1] ?? '') === currentDashboardPath
                      const Icon = item.icon
                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            render={options ? <Link {...options} /> : undefined}
                            isActive={isActive}
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
        </SidebarContent>
        <SidebarFooter>
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
                <BreadcrumbLink
                  render={<Link to="/{-$locale}/dashboard/profile" params={{ locale }} />}
                >
                  {m.settings_title()}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {currentMeta && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentMeta.title}</BreadcrumbPage>
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
