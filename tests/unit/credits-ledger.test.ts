import { describe, expect, it } from 'vitest'
import {
  availableAmount,
  planAllocation,
  planExpiry,
  sortBuckets,
} from '../../src/modules/credits/ledger'

/**
 * 积分账本的纯逻辑：批次分配与过期判定。
 *
 * 「快过期的积分先用掉」是账本最核心的业务规则，它必须能脱离数据库单测——
 * 一旦这条规则被改错，余额不会算错，但用户会感觉「我的积分白过期了」。
 */

const HOUR = 60 * 60 * 1000

describe('批次排序', () => {
  it('先到期的排前面，永不过期的排最后', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const buckets = [
      { id: 'never', remaining: 10, expiresAt: null },
      { id: 'late', remaining: 10, expiresAt: new Date(now.getTime() + 2 * HOUR) },
      { id: 'soon', remaining: 10, expiresAt: new Date(now.getTime() + HOUR) },
    ]
    expect(sortBuckets(buckets).map((b) => b.id)).toEqual(['soon', 'late', 'never'])
  })

  it('同一到期时间按 id 稳定排序', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    const buckets = [
      { id: 'b', remaining: 1, expiresAt: at },
      { id: 'a', remaining: 1, expiresAt: at },
    ]
    expect(sortBuckets(buckets).map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('不改动入参', () => {
    const buckets = [
      { id: 'b', remaining: 1, expiresAt: new Date(0) },
      { id: 'a', remaining: 1, expiresAt: null },
    ]
    sortBuckets(buckets)
    expect(buckets.map((b) => b.id)).toEqual(['b', 'a'])
  })
})

describe('消费分配', () => {
  it('从最先到期的批次开始扣', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const buckets = [
      { id: 'never', remaining: 100, expiresAt: null },
      { id: 'soon', remaining: 30, expiresAt: new Date(now.getTime() + HOUR) },
    ]
    expect(planAllocation(buckets, 50)).toEqual([
      { grantId: 'soon', amount: 30 },
      { grantId: 'never', amount: 20 },
    ])
  })

  it('额度不足时只分配能分到的部分', () => {
    const buckets = [{ id: 'a', remaining: 5, expiresAt: null }]
    expect(planAllocation(buckets, 10)).toEqual([{ grantId: 'a', amount: 5 }])
  })

  it('用完的批次不参与分配', () => {
    const buckets = [
      { id: 'empty', remaining: 0, expiresAt: null },
      { id: 'a', remaining: 7, expiresAt: null },
    ]
    expect(planAllocation(buckets, 3)).toEqual([{ grantId: 'a', amount: 3 }])
  })

  it('请求量非正数时什么都不分配', () => {
    expect(planAllocation([{ id: 'a', remaining: 7, expiresAt: null }], 0)).toEqual([])
    expect(planAllocation([{ id: 'a', remaining: 7, expiresAt: null }], -1)).toEqual([])
  })
})

describe('可用额度与过期', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('可用额度不含已过期与已用完的批次', () => {
    const buckets = [
      { id: 'live', remaining: 10, expiresAt: new Date(now.getTime() + HOUR) },
      { id: 'gone', remaining: 8, expiresAt: new Date(now.getTime() - HOUR) },
      { id: 'spent', remaining: 0, expiresAt: null },
      { id: 'forever', remaining: 3, expiresAt: null },
    ]
    expect(availableAmount(buckets, now)).toBe(13)
  })

  it('过期批次要被作废，作废量是它的剩余量', () => {
    const buckets = [
      { id: 'gone', remaining: 8, expiresAt: new Date(now.getTime() - HOUR) },
      { id: 'justExpired', remaining: 2, expiresAt: new Date(now.getTime()) },
      { id: 'live', remaining: 10, expiresAt: new Date(now.getTime() + HOUR) },
    ]
    expect(planExpiry(buckets, now)).toEqual([
      { grantId: 'gone', amount: 8 },
      { grantId: 'justExpired', amount: 2 },
    ])
  })

  it('已用完的批次不再作废', () => {
    const buckets = [{ id: 'gone', remaining: 0, expiresAt: new Date(now.getTime() - HOUR) }]
    expect(planExpiry(buckets, now)).toEqual([])
  })
})
