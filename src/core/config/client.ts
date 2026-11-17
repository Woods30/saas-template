/**
 * 客户端装载站点配置。
 *
 * SSR 把生效配置写进 `<head>` 的 JSON script，客户端在 hydration **之前**
 * 读回来装上：路由表、页面组件、`<head>` 里的 SEO 读的都是同一份，
 * 不会出现「服务端渲染了数据库配置、客户端渲染了出厂配置」的错位。
 */
import { setResolvedConfig, type WebsiteConfig } from '@/config/website'
import { parseSiteConfig, SITE_CONFIG_ELEMENT_ID } from './serialize'

/** 从文档里读回配置并装上；读不到就保持出厂配置。 */
export function installSiteConfigFromDocument(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (!target) return
  const element = target.getElementById(SITE_CONFIG_ELEMENT_ID)
  const raw = element?.textContent
  if (!raw) return
  const config = parseSiteConfig(raw)
  if (config) {
    setResolvedConfig(config)
    return
  }
  console.warn('[config] 装载站点配置失败，使用出厂配置')
}

export type { WebsiteConfig }
