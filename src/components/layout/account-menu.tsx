import { IconLogout, IconSettings, IconShieldLock } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { adminRoutes, settingsRoutes } from '@/config/routes'
import { websiteConfig } from '@/config/website'
import { signOutAndRedirect } from '@/core/auth/sign-out'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 账号菜单的公共条目。
 *
 * 顶栏用户菜单与侧栏用户卡片各有一份外壳（触发器、主题子菜单不同），
 * 但「个人中心 / 管理后台 / 退出」三项完全一致，集中在这里避免文案与路径漂移。
 */

/** 管理台入口的可见性：角色 + 功能开关双重约束。 */
export function isAdminUser(user: { role?: string | null }): boolean {
  return websiteConfig.features.enableAdmin && user.role === 'admin'
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
