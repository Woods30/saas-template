import { Menu } from '@base-ui/react/menu'
import { IconChevronUp, IconLogout } from '@tabler/icons-react'
import type { SessionInfo } from '@/auth/session'
import { signOutAndRedirect } from '@/auth/sign-out'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 侧栏底部的用户卡片：头像 + 名字 + 邮箱，展开后登出。
 *
 * 个人中心是 `_layout` 路由、**不渲染营销导航栏**，因此导航栏 `UserMenu` 里的登出入口
 * 在这里是不可见的——这张卡片就是个人中心内唯一的登出口。
 *
 * 头像走 shadcn 的 `Avatar`：`image` 为空（邮箱密码注册用户）时自动落到
 * `AvatarFallback`，渲染首字母；`name` 也为空时用邮箱首字母。
 *
 * 登出委托 `signOutAndRedirect`，本组件不碰 `location`。
 */
export function SettingsUserCard({ session }: { session: SessionInfo }) {
  const { name, email, image } = session.user
  const initial = (name.trim() || email).charAt(0).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu.Root>
          <Menu.Trigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={name || email}
                tooltip={name || email}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name || email}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <IconChevronUp className="ml-auto size-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
              <Menu.Popup className="min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                <Menu.Item
                  onClick={() => void signOutAndRedirect()}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  <IconLogout size={16} aria-hidden />
                  {m.auth_logout()}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
