import type { TablerIcon } from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
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
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { AppRoute } from '@/config/routes'
import { websiteConfig } from '@/config/website'
import { authClient } from '@/core/auth/client'
import type { SessionInfo } from '@/core/auth/session'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/** 页面元数据。菜单配置是唯一来源，布局只负责渲染。 */
export interface SectionMeta {
  title: string
  description: string
  icon?: TablerIcon
}

/** 侧栏菜单项尺寸覆盖：原件 32px 行高在本仓 240px 侧栏里偏挤，这里放大到 40px。
 * 收起态原件 `size-8!` 带 important，覆盖时同样要带 `!`。 */
export const SIDEBAR_ITEM_CLASS =
  'h-10 text-[0.9375rem] [&_svg]:size-[1.125rem] group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:[&_svg]:size-5'

/** 当前路径在布局内的相对段：`/zh/admin/users` → `users`，`/zh/admin` → `''`。 */
export function useSectionPath(base: 'admin' | 'settings'): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return pathname.split(`/${base}/`)[1] ?? ''
}

/** 菜单项（惰性文案）转成渲染用的元数据；文案在渲染时求值以跟随请求语言。 */
export function toSectionMeta(
  item: { title: () => string; description: () => string; icon?: TablerIcon } | undefined,
): SectionMeta | undefined {
  return item
    ? { title: item.title(), description: item.description(), icon: item.icon }
    : undefined
}

/**
 * 个人中心与管理台共用的外壳。
 *
 * 侧栏折叠、cookie 持久化与窄屏 Sheet 都由 shadcn `sidebar` 原件负责；
 * 内容区标题与说明由这里统一渲染（数据来自菜单配置），页面自己不再写标题块；
 * `DashboardUserCard` 是唯一的登出入口。
 */
export function DashboardShell({
  locale,
  session,
  meta,
  root,
  sidebar,
  footer,
  hidePageHeader = false,
  fullWidth = false,
  children,
}: {
  locale: Locale
  session: SessionInfo
  meta: SectionMeta | undefined
  /** 面包屑第二级：本布局的入口。 */
  root: { label: string; to: AppRoute }
  sidebar: ReactNode
  footer: ReactNode
  /** 详情页自带标题，不再叠加布局标题（避免两个 `<h1>`）。 */
  hidePageHeader?: boolean
  /** 管理台满宽（表格多列需要横向空间）；个人中心保持收窄阅读宽度。 */
  fullWidth?: boolean
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
        {/* 管理台满宽，个人中心用 `max-w-6xl` 收窄：后者表单为主，过宽反而难读。 */}
        <div className={`w-full min-w-0 px-4 py-6 md:px-6 ${fullWidth ? '' : 'mx-auto max-w-6xl'}`}>
          {meta && !hidePageHeader && (
            <div className="mb-6 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
              {meta.description && (
                <p className="text-sm text-muted-foreground">{meta.description}</p>
              )}
            </div>
          )}
          {children}
        </div>
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
