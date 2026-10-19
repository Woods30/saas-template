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
 * 侧栏底部的用户卡片：头像 + 名字 + 邮箱，展开后是账号菜单。
 *
 * 个人中心是 `_layout` 路由、**不渲染营销导航栏**，因此导航栏 `UserMenu` 里的入口
 * 在这里是不可见的——这张卡片就是个人中心内唯一的账号出口。
 *
 * 菜单内容（顺序即分组）：
 * - 账号信息（只读）；
 * - 进入个人中心、**主题**（子菜单）；
 * - 退出登录。
 *
 * 主题放在账号菜单里而不是侧栏里单独一行：它和「进入个人中心 / 退出登录」一样是
 * 「关于我」的设置项，同组才对齐；单独一行会既不对齐图标、又占一条菜单高度。
 * 用 `DropdownMenuSub` 而不是平铺三个选项，是为了菜单本身不因主题变长。
 *
 * 头像走 shadcn 的 `Avatar`：`image` 为空（邮箱密码注册用户）时自动落到
 * `AvatarFallback`，渲染首字母；`name` 也为空时用邮箱首字母。
 */
export function DashboardUserCard({ session }: { session: SessionInfo }) {
  const { name, email, image } = session.user
  const initial = (name.trim() || email).charAt(0).toUpperCase()
  // 主题状态提到菜单层：子菜单项与触发按钮上的当前主题图标共用同一份状态。
  const { theme, apply, enabled } = useTheme()
  // 受控开合：点选主题后菜单保持打开，用户能看到选中态变化再自行关闭。
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
            {/* 头像照 shadcn 的 `nav-user` 写法：`rounded-lg` 方形 + `grayscale`。
                侧栏是导航区，圆形彩色头像会抢走菜单项的注意力；方形去饱和让它
                与下面的图标列同构，只在鼠标移入时才显得「是一个人」。 */}
            <Avatar className="size-8 rounded-lg grayscale">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name || email}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            {/* 竖三点而非上箭头：菜单从右侧弹出，不是向上展开。 */}
            <IconDotsVertical className="ml-auto size-4" />
          </DropdownMenuTrigger>
          {/* 菜单贴侧栏右缘向外展开（`side="right" align="end"`），与 shadcn 的
              `nav-user` 一致。早先是向上弹出，会把内容区的图表挡住一大块；
              从右侧展开只覆盖内容区最左一列，关闭后也不与侧栏本身的滚动冲突。 */}
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
            className="min-w-56"
          >
            <DropdownMenuGroup>
              {/* 账号块：头像 + 名字 + 邮箱，与触发按钮同一套排版。
                  用 `p-0 font-normal` 去掉 label 的默认字号与内边距，
                  内层再按菜单项的水平缩进对齐。 */}
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
