import { IconLogout, IconSettings, IconUser } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useSession } from '@/auth/client'
import { signOutAndRedirect } from '@/auth/sign-out'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getRequestLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

interface UserMenuProps {
  /** 未登录时渲染的内容（通常是「登录」链接）；登录后由用户菜单取代。 */
  guestFallback?: ReactNode
}

/**
 * 导航栏的账号区。待定时也渲染 `guestFallback` 而非骨架：SSR 阶段会话未定，
 * 骨架会让服务端 HTML 里没有登录入口，登录链接会闪一下才出现。
 */
export function UserMenu({ guestFallback }: UserMenuProps) {
  const { data: session, isPending } = useSession()

  if (isPending || !session) return <>{guestFallback}</>

  const label = session.user.name ?? session.user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={label} />}>
        <IconUser aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
        {/* `DropdownMenuLabel` 是 Base UI 的 GroupLabel，必须包在 Group 内。 */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="text-xs text-muted-foreground">{m.auth_menu_account()}</p>
            <p className="truncate text-sm font-medium">{session.user.email}</p>
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
        <DropdownMenuItem onClick={() => void signOutAndRedirect()}>
          <IconLogout size={16} aria-hidden />
          {m.auth_logout()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
