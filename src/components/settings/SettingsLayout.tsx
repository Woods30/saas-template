import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { getSettingsSections } from '@/config/settings'
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
 */
export function SettingsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sections = getSettingsSections(locale, {
    config: websiteConfig,
    authenticated: true,
  })

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{m.settings_title()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map((item) => {
                  const options =
                    item.destination.kind === 'internal' ? item.destination.options : null
                  // 高亮当前板块：子页路径以该项的目标路径为前缀。
                  const isActive =
                    options !== null && 'to' in options && pathname.endsWith(`/settings/${item.id}`)
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
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">{m.settings_title()}</h1>
          {/* 个人中心不渲染营销导航栏（`_layout` 路由与 docs 一致），
              因此这里给出回站点的入口，避免页面成为死胡同。 */}
          <Link
            to="/{-$locale}"
            params={{ locale }}
            className="ml-auto text-sm text-muted-foreground underline hover:text-foreground"
          >
            {m.settings_back_home()}
          </Link>
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
