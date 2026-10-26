export const CACHE_TTL = {
  newsletterStatus: 60 * 60,
  providerStatus: 5 * 60,
  publicList: 60,
  /**
   * Stripe 价格目录。
   *
   * 取价要打 Stripe API，定价页每次渲染都打一次既慢又可能被限流。改价不频繁，
   * 10 分钟足够；缓存 key 里带 lookup key 列表，改 env 后自动失效。
   */
  priceCatalog: 10 * 60,
} as const
