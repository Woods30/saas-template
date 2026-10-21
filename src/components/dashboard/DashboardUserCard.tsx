import { IconDotsVertical, IconLogout, IconSettings } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { SessionInfo } from '@/auth/session'
import { signOutAndRedirect } from '@/auth/sign-out'
import { THEME_ICON, ThemeMenuItems, useTheme } from '@/components/theme/ThemeToggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { getRequestLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 侧栏底部的用户卡片：头像 + 名字 + 邮箱，展开后是账号菜单。个人中心是 `_layout`
 * 路由、不渲染营销导航栏，因此这里是工作台内唯一的账号出口。主题用子菜单收纳，
 * 避免平铺后菜单变长。
 */
export function DashboardUserCard({ session }: { session: SessionInfo }) {
  const { name, email, image } = session.user
  const initial = (name.trim() || email).charAt(0).toUpperCase()
  const { theme, apply, enabled } = useTheme()
  // 受控开合：点选主题后菜单保持打开，用户能看到选中态变化。
  const [open, setOpen] = useState(false)
  // 窄屏侧栏是 Sheet 抽屉，菜单从右侧弹出会顶到视口外，改用底部。
  const { isMobile } = useSidebar()
  const ThemeIcon = THEME_ICON[theme]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={name || email}
                tooltip={name || email}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {/* 方形去饱和头像，与下方图标列同构，避免抢走菜单项的注意力。 */}
            <Avatar className="size-8 rounded-lg grayscale">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name || email}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <IconDotsVertical className="ml-auto size-4" />
          </DropdownMenuTrigger>
          {/* 从右侧展开只覆盖内容区最左一列；向上弹会挡住内容区的图表。 */}
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
            className="min-w-56"
          >
            <DropdownMenuGroup>
              {/* `p-0 font-normal` 去掉 label 默认样式，内层按菜单项缩进对齐。 */}
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    {image && <AvatarImage src={image} alt="" />}
                    <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name || email}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link to="/{-$locale}/dashboard/profile" params={{ locale: getRequestLocale() }} />
              }
            >
              <IconSettings size={16} aria-hidden />
              {m.settings_user_menu()}
            </DropdownMenuItem>
            {enabled && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ThemeIcon size={16} aria-hidden />
                  {m.theme_label()}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <ThemeMenuItems theme={theme} apply={apply} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOutAndRedirect()}>
              <IconLogout size={16} aria-hidden />
              {m.auth_logout()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
