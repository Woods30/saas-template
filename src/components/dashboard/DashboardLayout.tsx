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
/**
 * 侧栏菜单项的尺寸覆盖（展开态 + 收起态）。
 *
 * shadcn 原件给的是 32px 行高 + 16px 图标 + 14px 字号，在本仓 240px 宽的侧栏里偏小、
 * 偏挤：行与行之间几乎没有呼吸，图标也压不住文字。这里在**调用处**统一放大——
 *
 * - 展开态：40px 行高 + 18px 图标 + 15px 字号；
 * - 收起态：36px 按钮 + 20px 图标（原件的 `size-8!` 带 important，必须同样带 `!`）。
 *
 * 不改 `src/components/ui/sidebar.tsx`（上游原件不本地修改）。
 */
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
      {/* `variant="inset"` 与 tweakcn 的 dashboard 示例一致：内容区是一块从侧栏
          旁浮起的面板（8px 外边距 + `rounded-xl` + `shadow-sm`），顶栏贴着面板顶部
          并带一条 `border-b`，两者共同构成面板的上边缘。

          本主题下 `--sidebar` 与 `--background` 同值，面板没有底色差，边界全靠
          `shadow-sm`（浅色档为 8% 品牌紫）与顶栏那条 `--border` 细线来读。这不是
          缺陷——tweakcn 的预览也是同一套 token、同样的视觉效果，照抄即可。 */}
      <Sidebar variant="inset" collapsible="icon">
        {/* 侧栏头：展开态是横向 logo，收起态换成方形图标。
            横版 logo 的宽高比是 1400:380（≈3.7:1），塞进 3rem 宽的收起态只有 18×5px，
            形同噪点。收起态改用 `icon`（128×128 正方形），并按容器宽度撑满。 */}
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
          {/* 主题切换不在这里单列一行：它已收进用户菜单（见 `DashboardUserCard`），
              与「进入个人中心 / 退出登录」同组才对齐，也不额外占一条菜单高度。 */}
          <DashboardUserCard session={session} />
        </SidebarFooter>
      </Sidebar>
      {/* `min-w-0` 不能省：`SidebarInset` 是 flex item，默认 `min-width: auto`，
          宽表格的 min-content 宽度会把它撑出视口（768px 下实测撑到 760px，整页横向滚动）。
          允许收缩后，表格由 `Table` 自带的 `overflow-x-auto` 容器内部滚动。

          inset 变体的 `m-2` / `rounded-xl` / `shadow-sm` 由 `ui/sidebar` 原件按
          `data-variant=inset` 自动给出，这里不再重复写。 */}
      <SidebarInset className="min-w-0">
        {/* 顶栏与 tweakcn 的 dashboard 示例同高同宽：`h-12`（48px），左右留白
            `px-4` / `md:px-6`，底边一条 `--border` 细线——inset 面板的上边缘
            就由这条线与面板阴影共同界定，不加这条线，浮起的面板在浅色下读不出顶边。 */}
        <header className="flex h-12 items-center gap-2 border-b px-4 md:px-6">
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
          {/* 窄屏（`md` 以下）顶栏单独放主题切换。
              侧栏在窄屏是 Sheet 抽屉，主题收在抽屉底部的用户菜单里要点三次才够到；
              顶栏放一个图标按钮，一步可达。`md` 以上侧栏常驻，入口回到用户菜单，
              这里隐藏，避免两处重复。 */}
          <div className="ml-auto md:hidden">
            <ThemeToggle />
          </div>
        </header>
        {session.impersonating && <ImpersonationBanner />}
        {/* 内容区宽度：`max-w-6xl`（1152px）而非表单页常用的 `max-w-3xl`。
            本区既有单列表单（资料 / 安全），也有 5–6 列的表格（登录设备 / API 密钥 /
            用户管理）；3xl 会让表格列挤在一起、操作按钮换行。6xl 在 1440px 屏上留出
            合理边距，在更宽的屏上也不会拉成难读的长行。 */}
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * 模拟登录提示条。
 *
 * 管理员 impersonate 后浏览器里的身份就是被模拟用户，界面本身看不出差别；没有这条
 * 提示，管理员很容易忘记自己在「别人身上」操作。退出走插件的 `stopImpersonating`，
 * 它会恢复原管理员会话——不要自己删 cookie，插件还维护着 `admin_session` 备份。
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
