export const CACHE_TTL = {
  newsletterStatus: 60 * 60,
  providerStatus: 5 * 60,
  publicList: 60,
  /**
   * Stripe 价格目录。
   *
   * 取价要打 Stripe API，每次渲染都打既慢又可能被限流，所以必须缓存。
   * 但改价要尽快反映到页面：运营改完价盯着页面看不到变化，会以为改错了。
   * 取 KV 允许的最小值 60 秒——改价 1 分钟内生效，Stripe 调用最多每分钟一次。
   * 缓存 key 里带 lookup key 列表，改 env 后自动失效。
   */
  priceCatalog: 60,
} as const
