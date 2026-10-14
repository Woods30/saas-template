import { Menu } from '@base-ui/react/menu'
import { IconLogout, IconSettings, IconUser } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { signOut, useSession } from '@/auth/client'
import { Button } from '@/components/ui/button'
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
 * - **已登录**：用户菜单，展示账号邮箱并提供登出（此前 `signOut` 已导出却无人调用）。
 */
export function UserMenu({ guestFallback }: UserMenuProps) {
  const { data: session, isPending } = useSession()

  // 待定与未登录都渲染访客入口：前者保证 SSR 与首帧一致，后者是真实状态。
  if (isPending || !session) return <>{guestFallback}</>

  const label = session.user.name ?? session.user.email

  async function onSignOut() {
    const { error } = await signOut()
    if (error) {
      // 失败时留在原地：整页跳转会让用户以为已经登出，而会话其实还在。
      console.warn(`[auth] 登出失败: ${error.message ?? 'unknown'}`)
      return
    }
    window.location.assign('/')
  }

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="ghost" size="icon" aria-label={label} />}>
        <IconUser aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8}>
          <Menu.Popup className="min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <div className="border-b border-border px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{m.auth_menu_account()}</p>
              <p className="truncate text-sm font-medium">{session.user.email}</p>
            </div>
            <Menu.Item
              render={
                <Link
                  to="/{-$locale}/settings/profile"
                  params={{ locale: getRequestLocale() }}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                />
              }
            >
              <IconSettings size={16} aria-hidden />
              {m.settings_user_menu()}
            </Menu.Item>
            <Menu.Item
              onClick={onSignOut}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
              <IconLogout size={16} aria-hidden />
              {m.auth_logout()}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
