import { findAdminNavItem, getAdminNav } from '@/config/admin-nav'
import { type AdminRoute, pathOf, type SettingsRoute, sectionOf } from '@/config/routes'
import { findSettingsNavItem } from '@/config/settings-nav'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from './locale'
import { seo } from './seo'

/**
 * 受保护页面的 `<head>`。
 *
 * 标题与说明直接取自菜单配置（`config/admin-nav.ts` / `config/settings-nav.ts`），
 * 页面只声明「我是哪个路由」，不再第三次抄写同一段文案。
 */
function sectionHead(
  path: string,
  copy: { title: () => string; description: () => string } | undefined,
) {
  return seo(path, {
    title: copy?.title() ?? '',
    description: copy?.description() ?? '',
    locale: getRequestLocale(),
    noindex: true,
  })
}

export function adminHead(to: AdminRoute) {
  return sectionHead(
    pathOf(to),
    findAdminNavItem(getAdminNav(websiteConfig), sectionOf(to, 'admin')),
  )
}

export function settingsHead(to: SettingsRoute) {
  return sectionHead(pathOf(to), findSettingsNavItem(sectionOf(to, 'settings')))
}
