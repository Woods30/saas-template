/**
 * 站点配置的序列化（客户端与服务端共用）。
 *
 * 配置要跨 SSR → 客户端这一程：服务端把生效配置写进 HTML 的
 * `<script type="application/json">`，客户端在 hydration 前读回来装上，
 * 两边读到同一份，SSR 与 hydration 不会因为配置不同而错位。
 */
import type { WebsiteConfig } from '@/config/website'

/** 承载配置的 script 元素 id。 */
export const SITE_CONFIG_ELEMENT_ID = 'site-config'

/**
 * 序列化为可安全嵌入 HTML 的 JSON。
 *
 * `<` 转成 `<`：配置里出现 `</script>` 会提前闭合 script 标签，
 * 既是注入面也是解析错误。
 */
export function serializeSiteConfig(config: WebsiteConfig): string {
  return JSON.stringify(config).replace(/</g, '\\u003c')
}

/** 解析客户端读到的配置；格式不对时返回 undefined（调用方回退出厂配置）。 */
export function parseSiteConfig(raw: string): WebsiteConfig | undefined {
  try {
    return JSON.parse(raw) as WebsiteConfig
  } catch {
    return undefined
  }
}
