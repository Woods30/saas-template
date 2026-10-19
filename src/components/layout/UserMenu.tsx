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
 * 导航栏的账号区。
 *
 * 渲染规则（顺序即优先级）：
 *
 * - **会话待定**（`isPending`）：渲染 `guestFallback`。这里**不能**渲染骨架：SSR 阶段
 *   会话请求尚未完成，服务端输出的就是待定态；若待定态渲染骨架，服务端 HTML 里就
 *   完全没有「登录」入口，访客要等客户端拿到会话后才看到它，登录链接会闪一下才出现。
 *   渲染 `guestFallback` 则让 SSR 与客户端首帧一致（都是登录入口），hydration 后
 *   再按真实会话切换。
 * - **未登录**：`guestFallback`。
 * - **已登录**：用户菜单，展示账号邮箱并提供登出（登出经 `signOutAndRedirect`，与个人中心用户卡片共用）。
 */
export function UserMenu({ guestFallback }: UserMenuProps) {
  const { data: session, isPending } = useSession()

  // 待定与未登录都渲染访客入口：前者保证 SSR 与首帧一致，后者是真实状态。
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
