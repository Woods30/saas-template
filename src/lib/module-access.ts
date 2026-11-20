import { notFound } from '@tanstack/react-router'
import { type SiteModule, type WebsiteConfig, websiteConfig } from '@/config/website'
import { hasAdminAccess } from '@/core/auth/rbac'

/**
 * 页面功能门禁：模块关闭时抛 `notFound()`，页面以 404 呈现。
 *
 * 路由文件保留（不做条件注册），保证构建期路由表稳定。纯逻辑，不读服务端 env。
 */
export function assertPageEnabled(module: SiteModule, config: WebsiteConfig = websiteConfig) {
  if (!config[module].enabled) throw notFound()
}

/**
 * 静态营销页（`pages.*`）门禁，用于没有服务模块但需要按站点定位开关的页面。
 */
export function assertStaticPageEnabled(
  page: keyof WebsiteConfig['pages'],
  config: WebsiteConfig = websiteConfig,
) {
  if (!config.pages[page]) throw notFound()
}

/**
 * 用户中心功能开关（`userFeatures.*`）门禁，用于 API key 管理页等按 flag 开关的页面。
 */
export function assertUserFeatureEnabled(
  feature: keyof WebsiteConfig['userFeatures'],
  config: WebsiteConfig = websiteConfig,
) {
  if (!config.userFeatures[feature]) throw notFound()
}

/**
 * 管理台入口门禁：持有任意 `admin.*` 权限点才放行，否则 `notFound()`。
 *
 * 用 404 而非 403，不向非管理员泄漏「这个页面存在」。判定见 `hasAdminAccess`：
 * 不能写成 `matchPermission('admin.*', …)`，那会把持有具体权限点的
 * `admin` / `editor` 一起挡在外面。
 *
 * 这里只做「能不能进管理台」的判定；进去以后每个接口仍按具体权限点校验。
 */
export function assertAdminAccess(permissions: readonly string[] | undefined): void {
  if (!hasAdminAccess(permissions ?? [])) throw notFound()
}
