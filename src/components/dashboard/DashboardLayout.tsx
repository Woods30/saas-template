import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SessionInfo } from '@/auth/session'
import { DashboardUserCard } from '@/components/dashboard/DashboardUserCard'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
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
 * 个人中心外壳。
 *
 * 侧边栏**直接用 shadcn 的 `sidebar`（Base UI 版）**，不自己实现折叠 / 持久化 /
 * 移动端抽屉——`SidebarProvider` 自带 cookie 持久化与键盘快捷键，`Sidebar` 在窄屏
 * 自动切为 `Sheet` 抽屉。这里只做组装：菜单项来自 `src/config/settings.ts`，
 * 内容区由 `SidebarInset` 承载。
 *
 * 与 `DocsLayout` 自建侧栏不同，这里不抽公共组件、也不改动 docs 的实现：docs 侧栏
 * 有它自己的 cookie 与折叠语义，两者强行合并只会互相牵制。
 *
 * 顶栏是「折叠按钮 + 三级面包屑 + 右上角主题切换」：页面标题由面包屑末级
 * （`aria-current="page"`）承担，因此这里不再渲染 `<h1>`；回站点的出口在侧栏头的
 * logo 上，因此也不需要单独的「返回站点」链接。
 *
 * 侧栏底部的 `DashboardUserCard` 是工作台内**唯一**的登出入口——本路由是 `_layout`，
 * 不渲染营销导航栏，导航栏 `UserMenu` 里的登出在这里不可见。
 */
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
  // 当前板块：取 `/dashboard/` 之后的一段，与侧栏高亮用的是同一个 pathname。
  // 未注册的新板块（未来加了路由但工厂还没补）匹配不到，此时面包屑退化为两级，
  // 不渲染一个空的末级。
  const currentSection = pathname.split('/dashboard/')[1]?.split('/')[0]
  const currentMeta = groups.some(
    (group) => group.kind === 'group' && group.items.some((item) => item.id === currentSection),
  )
    ? getSettingsSectionMeta(currentSection as Parameters<typeof getSettingsSectionMeta>[0])
    : null

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            to="/{-$locale}"
            params={{ locale }}
            aria-label={websiteConfig.metadata.name}
            className="flex items-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <img
              src={websiteConfig.metadata.images.logoLight}
              alt=""
              width={1400}
              height={380}
              className="h-auto w-28 dark:bg-white"
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
                      // 高亮当前板块：与 `currentSection` 用同一段 pathname 比较，
                      // 因此 `/dashboard/admin/users` 下 `id: 'admin'` 也能点亮。
                      const isActive =
                        options !== null && 'to' in options && currentSection === item.id
                      const Icon = item.icon
                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            render={options ? <Link {...options} /> : undefined}
                            isActive={isActive}
                            tooltip={item.title}
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
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          {/* 折叠按钮：点击收起侧栏为图标窄条，再点展开。宽窄屏都常驻——
              窄屏下侧栏是 Sheet 抽屉，同样需要它打开。 */}
          <SidebarTrigger />
          {/* 三级面包屑：末级带 aria-current="page"，即页面标题，
              因此这里不再放 <h1>；回站点入口由侧栏头的 logo 承担，
              因此也不放「返回站点」。 */}
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
          {/* 主题切换放顶栏右上角而非侧栏头：侧栏折叠后只剩约 3rem，
              按钮会和 logo 抢位；这里与营销站 Navbar 的位置一致。 */}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
