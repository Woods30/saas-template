import { notFound } from '@tanstack/react-router'
import { type SiteModule, type WebsiteConfig, websiteConfig } from '@/config/website'

/**
 * 页面功能门禁：模块关闭时抛 `notFound()`，页面以 404 呈现。
 *
 * 路由文件保留（不做条件注册），保证构建期路由表稳定。纯逻辑，不读服务端 env。
 */
export function assertPageEnabled(module: SiteModule, config: WebsiteConfig = websiteConfig) {
  if (!config[module].enabled) throw notFound()
}

/**
 * 功能开关（`features.*`）门禁，用于 API key 管理页等「按 flag 开关的能力」。
 */
export function assertFeatureEnabled(
  feature: keyof WebsiteConfig['features'],
  config: WebsiteConfig = websiteConfig,
) {
  if (!config.features[feature]) throw notFound()
}

/**
 * 角色门禁：非 admin 抛 `notFound()`。
 *
 * 用 404 而非 403，不向非管理员泄漏「这个页面存在」。只认精确的 `'admin'`。
 */
export function assertAdminRole(role: string | undefined): void {
  if (role !== 'admin') throw notFound()
}
