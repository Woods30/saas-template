import { createServerFn } from '@tanstack/react-start'
import type { PriceCatalog } from './price-catalog'

/**
 * 价格目录的 server function：定价页与首页据此渲染**真实**价格。
 *
 * 取价走 Stripe 的 Prices API（按 `lookup_key` 批量查），结果在服务端缓存，
 * 不在客户端缓存——Stripe 官方建议给取价加 caching layer，别每次渲染都打 API。
 */

/**
 * 取当前价格目录。
 *
 * 失败时返回空目录而不是抛错：定价页应当照常渲染（只是显示不出价格），
 * 而不是一个 500 的营销页。真正要下单时走 `/api/payment`，那里失败会返回 502。
 */
export const fetchPriceCatalog = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PriceCatalog> => {
    try {
      const { getPriceCatalog } = await import('./price-catalog.server')
      return await getPriceCatalog()
    } catch (err) {
      console.warn(
        '[price-catalog] 取价失败：',
        err instanceof Error ? err.message.split('\n')[0] : 'unknown',
      )
      return {}
    }
  },
)
