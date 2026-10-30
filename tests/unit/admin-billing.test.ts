import { describe, expect, it } from 'vitest'
import { summarizeRevenue } from '@/payment/admin-billing-query'

/**
 * 管理台营收聚合。
 *
 * 两个容易出错的点：失败支付不能计入营收；不同币种不能直接相加（金额单位与汇率
 * 都不同，相加会得到一个没有意义的数字）。
 */
describe('summarizeRevenue', () => {
  const paid = (amount: number, currency = 'usd', refundedAmount = 0) => ({
    amount,
    currency,
    refundedAmount,
    status: 'paid',
  })

  it('空数据返回空汇总', () => {
    const summary = summarizeRevenue([])
    expect(summary.buckets).toEqual([])
    expect(summary.primary).toBeNull()
    expect(summary.failedCount).toBe(0)
  })

  it('失败支付不计入营收，只计数', () => {
    const summary = summarizeRevenue([
      paid(1000),
      paid(2000),
      { amount: 5000, currency: 'usd', refundedAmount: 0, status: 'failed' },
    ])
    expect(summary.primary?.gross).toBe(3000)
    expect(summary.primary?.count).toBe(2)
    expect(summary.failedCount).toBe(1)
  })

  it('净额扣除退款', () => {
    const summary = summarizeRevenue([
      paid(1000, 'usd', 300),
      { amount: 2000, currency: 'usd', refundedAmount: 2000, status: 'refunded' },
    ])
    expect(summary.primary).toMatchObject({ gross: 3000, refunded: 2300, net: 700, count: 2 })
  })

  it('多币种分别汇总，不相加', () => {
    const summary = summarizeRevenue([paid(1000, 'usd'), paid(2000, 'cny')])
    expect(summary.buckets).toHaveLength(2)
    const usd = summary.buckets.find((bucket) => bucket.currency === 'usd')
    const cny = summary.buckets.find((bucket) => bucket.currency === 'cny')
    expect(usd).toMatchObject({ gross: 1000, count: 1 })
    expect(cny).toMatchObject({ gross: 2000, count: 1 })
  })

  it('币种大小写归一到同一组', () => {
    const summary = summarizeRevenue([paid(1000, 'USD'), paid(500, 'usd')])
    expect(summary.buckets).toHaveLength(1)
    expect(summary.primary).toMatchObject({ currency: 'usd', gross: 1500, count: 2 })
  })

  it('primary 取净额最高的币种', () => {
    const summary = summarizeRevenue([paid(1000, 'usd'), paid(2000, 'cny')])
    expect(summary.primary?.currency).toBe('cny')
  })
})
