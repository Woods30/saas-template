import { notFound } from '@tanstack/react-router'
import { type SiteModule, type WebsiteConfig, websiteConfig } from '@/config/website'

/**
 * 页面功能门禁。
 *
 * 模块在站点配置中关闭时抛出 TanStack 的 `notFound()`，使页面以 404 呈现；
 * 路由文件保留（不做条件注册），保证构建期路由表稳定。用于 docs 父路由、
 * blog 列表与详情、changelog、pricing、contact 的 `beforeLoad` 最前处，与
 * sitemap 使用同一套开关。
 *
 * 该模块为纯逻辑，不读取服务端 env，可安全进入客户端 bundle。
 */
export function assertPageEnabled(module: SiteModule, config: WebsiteConfig = websiteConfig) {
  if (!config[module].enabled) throw notFound()
}

/**
 * 功能开关（`features.*`）门禁。
 *
 * 与服务模块门禁分开：服务模块是 `config[module].enabled`，功能开关本身就是布尔值。
 * 用于 API key 管理页等「按 flag 开关的能力」，关闭时页面以 404 呈现，与服务模块
 * 门禁语义一致。
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
 * 用 404 而非 403，与 `assertFeatureEnabled` 同源——不向非管理员泄漏「这个页面存在」
 * 这一事实。只认精确的 `'admin'`，不做大小写或前缀模糊匹配；`undefined`（未登录或
 * 字段缺失）一律拒绝。
 */
export function assertAdminRole(role: string | undefined): void {
  if (role !== 'admin') throw notFound()
}
