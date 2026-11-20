import { IconLogout, IconSettings, IconShieldLock } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { adminRoutes, settingsRoutes } from '@/config/routes'
import { hasAdminAccess } from '@/core/auth/rbac'
import { signOutAndRedirect } from '@/core/auth/sign-out'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 账号菜单的公共条目。
 *
 * 顶栏用户菜单与侧栏用户卡片各有一份外壳（触发器、主题子菜单不同），
 * 但「个人中心 / 管理后台 / 退出」三项完全一致，集中在这里避免文案与路径漂移。
 */

/**
 * 管理台入口的可见性（权威判定）：持有任意 `admin.*` 权限点。
 *
 * 与服务端门禁（路由 `beforeLoad`、server function）用的是同一个判定
 * （`hasAdminAccess`），否则会出现「菜单显示但点进去 404」的错位。
 */
export function canEnterAdmin(permissions: readonly string[] | undefined): boolean {
  return hasAdminAccess(permissions ?? [])
}

/**
 * 客户端会话只有 `user.role`，没有权限点列表，因此这里用它的同步标记。
 *
 * `users.role` 由 RBAC 分配（`assignRolesToUser`）按「是否持有任意 `admin.*`
 * 权限」同步，正常路径下与 `canEnterAdmin` 同真同假。它只是入口提示：真正的
 * 门禁在路由与服务端，标记陈旧最多是多显示 / 少显示一个菜单项。
 *
 * `super_admin` 也算：手工改库的存量账号在 `loadUserPermissions` 里回退为 `['*']`，
 * 若这里只认 `'admin'`，顶栏会藏起入口而侧栏仍显示，两处不一致。
 */
export function hasAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** 个人中心与管理台入口；`isAdmin` 决定是否渲染管理后台入口。 */
export function AccountMenuLinks({ isAdmin, locale }: { isAdmin: boolean; locale: Locale }) {
  return (
    <>
      <DropdownMenuItem render={<Link to={settingsRoutes.profile} params={{ locale }} />}>
        <IconSettings size={16} aria-hidden />
        {m.settings_user_menu()}
      </DropdownMenuItem>
      {isAdmin && (
        <DropdownMenuItem render={<Link to={adminRoutes.overview} params={{ locale }} />}>
          <IconShieldLock size={16} aria-hidden />
          {m.admin_settings_feature_admin()}
        </DropdownMenuItem>
      )}
    </>
  )
}

/** 退出登录。跳转由 `signOutAndRedirect` 统一处理，避免各处自造重定向。 */
export function SignOutMenuItem() {
  return (
    <DropdownMenuItem onClick={() => void signOutAndRedirect()}>
      <IconLogout size={16} aria-hidden />
      {m.auth_logout()}
    </DropdownMenuItem>
  )
}
