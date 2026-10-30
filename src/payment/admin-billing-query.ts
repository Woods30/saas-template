/**
 * 管理台营收聚合。
 *
 * 单独成模块：只做纯计算，服务端与测试共用同一实现，也便于把「失败支付不计入」
 * 「多币种不相加」这类规则钉在测试里。
 */

/** 参与聚合的支付字段（`payments` 表子集）。 */
export interface AdminPaymentRow {
  amount: number
  currency: string
  refundedAmount: number
  status: string
}

export interface RevenueBucket {
  /** 已归一小写的币种。 */
  currency: string
  /** 成功收款总额，含之后被退掉的部分。 */
  gross: number
  refunded: number
  /** `gross - refunded`。 */
  net: number
  /** 成功支付笔数（不含失败）。 */
  count: number
}

export interface RevenueSummary {
  /** 按净额降序；不同币种各成一组，绝不跨币种相加。 */
  buckets: RevenueBucket[]
  /** 净额最高的币种分组，供单币种场景直接展示。 */
  primary: RevenueBucket | null
  /** 失败支付笔数：不计入营收，但要让人知道发生过。 */
  failedCount: number
}

/**
 * 汇总营收。
 *
 * 失败支付不计入营收——钱没到账，算进去会让报表虚高。退款单独记在 `refunded`，
 * 净额据此扣除；多币种分组是硬约束，金额单位不同，相加得到的数字没有意义。
 */
export function summarizeRevenue(payments: readonly AdminPaymentRow[]): RevenueSummary {
  const byCurrency = new Map<string, RevenueBucket>()
  let failedCount = 0

  for (const payment of payments) {
    if (payment.status === 'failed') {
      failedCount += 1
      continue
    }
    const currency = payment.currency.toLowerCase()
    const bucket = byCurrency.get(currency) ?? {
      currency,
      gross: 0,
      refunded: 0,
      net: 0,
      count: 0,
    }
    bucket.gross += payment.amount
    bucket.refunded += payment.refundedAmount
    bucket.count += 1
    byCurrency.set(currency, bucket)
  }

  const buckets = [...byCurrency.values()]
    .map((bucket) => ({ ...bucket, net: bucket.gross - bucket.refunded }))
    .sort((a, b) => b.net - a.net)

  return { buckets, primary: buckets[0] ?? null, failedCount }
}
