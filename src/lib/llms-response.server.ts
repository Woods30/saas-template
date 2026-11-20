import { llmsConfig } from '@/config/llms'
import type { Locale } from '@/config/locale'
import { websiteConfig } from '@/config/website'
import { findCatalogAmount } from '@/core/payment/price-catalog'
import { getPriceCatalog } from '@/core/payment/price-catalog.server'
import { renderLlmsFull, renderLlmsIndex } from '@/lib/llms'
import { defaultLlmsSource } from '@/lib/llms-source.server'
import { getBaseUrl } from '@/lib/urls'

/**
 * llms.txt / llms-full.txt 的响应。
 *
 * 两个文件都在服务端渲染成纯文本：内容来自构建期生成的内容清单与站点配置，
 * 不需要数据库，也不需要客户端 JS。
 */

/** 纯文本响应；模型抓取端按 UTF-8 解码。 */
const CONTENT_TYPE = 'text/plain; charset=utf-8'

/**
 * 生成 llms 文件的响应。
 *
 * @param locale - 文件语言；由 URL 决定（`/llms.txt` 英文、`/llms.zh.txt` 中文），
 *   不读 cookie——爬虫不带 cookie，靠 cookie 判定会让两个版本指向同一份内容。
 * @param variant - `index` 出索引，`full` 出全文。
 */
export async function llmsTextResponse(
  locale: Locale,
  variant: 'index' | 'full',
): Promise<Response> {
  const options = {
    config: llmsConfig,
    locale,
    baseUrl: getBaseUrl(),
    // 价格事实源是 Stripe 的价格目录，与首页展示、结账收款同源。
    priceCents: findCatalogAmount(
      await getPriceCatalog(),
      websiteConfig.landingOffer.productId,
      websiteConfig.landingOffer.offerId,
    ),
    siteName: websiteConfig.metadata.name,
    source: defaultLlmsSource(),
  }
  const body = variant === 'full' ? renderLlmsFull(options) : renderLlmsIndex(options)
  return new Response(body, { headers: { 'Content-Type': CONTENT_TYPE } })
}
