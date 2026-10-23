import { createCacheKey, getOrSetCache } from '@/cache'
import { CACHE_TTL } from '@/cache/constants'
import { collectLookupKeys, findProductIdByLookupKey } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { getPaymentProvider } from '@/payment'
import type { PriceCatalog } from './price-catalog'

/**
 * 价格目录的服务端实现：真正打 Stripe API 的那一半。
 *
 * 带缓存：Stripe 官方对按 `lookup_key` 取价的建议里明确提醒要加 caching layer
 * （"To improve performance, you might want to add a caching layer to only reload the
 * price occasionally"）。没有缓存的话，定价页每次渲染都要打一次 Stripe API。
 *
 * 缓存 key 里带上 lookup key 列表：改了产品配置里的 key 就自动换缓存，不会读到旧价。
 */

/**
 * 取当前价格目录。
 *
 * 失败时抛错（由调用方决定怎么处理）：结账路径必须知道「取不到价」才能拒绝下单，
 * 不能拿一个空目录糊弄过去。
 */
export async function getPriceCatalog(): Promise<PriceCatalog> {
  const keys = collectLookupKeys()
  if (keys.length === 0) return {}

  return getOrSetCache({
    key: createCacheKey('payment', 'price-catalog', keys.join(',')),
    ttlSeconds: CACHE_TTL.priceCatalog,
    fetcher: async () => {
      const provider = getPaymentProvider(websiteConfig.payment.provider)
      const prices = await provider.listPricesByLookupKey(keys)
      const catalog: PriceCatalog = {}
      for (const price of prices) {
        // 没有 lookup_key 的 Price 无法与配置对应；amount 为 null 是阶梯计价，
        // 展示不出单一价格。两者都跳过，而不是编一个数出来。
        if (!price.lookupKey || price.amount === null) continue
        catalog[price.lookupKey] = {
          priceId: price.id,
          amount: price.amount,
          currency: price.currency,
          recurring: price.recurring,
          stripeProductId: price.stripeProductId,
        }
      }
      return catalog
    },
  })
}

/**
 * Stripe Price id → 产品 id。
 *
 * webhook 与账单页手上只有 Price id，要显示产品名就得反查。取不到时返回
 * `undefined`：Price 可能是后台手工创建的，不该假装认识它。
 */
export async function findProductIdByPriceId(priceId: string): Promise<string | undefined> {
  if (!priceId) return undefined
  const catalog = await getPriceCatalog()
  const lookupKey = Object.keys(catalog).find((key) => catalog[key]?.priceId === priceId)
  if (!lookupKey) return undefined
  return findProductIdByLookupKey(lookupKey)
}
