/**
 * 展示用的格式化函数。
 *
 * 金额一律以**最小货币单位**（分）存储，展示前按币种小数位换算——
 * 不同币种的小数位不同（USD 两位、JPY 零位），写死 100 会把日元显示成百倍。
 *
 * 日期不在这里格式化：统一走 `@/lib/datetime` 与 `<LocalDate>` / `<LocalDateTime>`，
 * 那条线上有 UTC 基准与水合一致性守卫。
 */

/**
 * 金额格式化。
 *
 * 币种非法时（数据库里存了脏数据）退回普通数字格式化，不让整页崩掉——
 * 一个坏币种不该让管理员看不到其它订单。
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      amount / 10 ** (digits ?? 2),
    )
  } catch {
    return new Intl.NumberFormat(locale).format(amount)
  }
}
