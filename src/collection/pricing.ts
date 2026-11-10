/**
 * 核销型支付的本地价格：解析、校验与金额格式化。
 *
 * 金额的事实源是商品配置里的 `collectionPrices`（单位：分）。这里只做解析与
 * 校验，不产生第二份金额 —— 展示与结算读的是同一处。
 */

export { collectionConfigErrors, resolveCollectionPrice } from '@/config/products'

/**
 * 按币种格式化金额（最小单位 → 货币单位）。
 *
 * 金额一律以「分」存储，但不同币种的小数位数不同（人民币 2 位、日元 0 位），
 * 因此位数取自 Intl 自己的解析结果，而不是写死 2。
 */
export function formatMoneyAmount(amount: number, currency: string, locale = 'zh'): string {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    amount / 10 ** (digits ?? 2),
  )
}
