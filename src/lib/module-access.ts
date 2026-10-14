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
