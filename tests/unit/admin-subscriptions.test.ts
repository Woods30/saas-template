import { describe, expect, it } from 'vitest'
import { queryAdminSubscriptions } from '../../src/modules/subscriptions/admin-subscriptions'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 管理台订阅列表。
 *
 * 与订单列表同构，但筛选维度是订阅状态，且状态集合比支付更细
 * （`trialing` / `past_due` / `canceled` 各自成档）。
 */

interface SubscriptionSeed {
  id: string
  /** 订阅行的 user_id 非空且随用户级联删除，不存在「买家已删」的订阅。 */
  userId?: string
  status?: string
  productId?: string | null
  offerId?: string | null
  amount?: number | null
  currency?: string | null
  interval?: string | null
  createdAt?: number
}

function seedSubscription(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  row: SubscriptionSeed,
): void {
  sqlite
    .prepare(
      `INSERT INTO subscriptions
        (id,user_id,provider,subscription_id,status,product_id,offer_id,amount,currency,interval,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      row.id,
      row.userId ?? 'u1',
      'stripe',
      `sub_${row.id}`,
      row.status ?? 'active',
      row.productId ?? 'pro',
      row.offerId ?? 'monthly',
      row.amount ?? 1000,
      row.currency ?? 'usd',
      row.interval ?? 'month',
      row.createdAt ?? 1,
    )
}

describe('管理台订阅列表', () => {
  it('按时间倒序返回订阅并带上买家邮箱', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedSubscription(sqlite, { id: 's1', createdAt: 100 })
    seedSubscription(sqlite, { id: 's2', createdAt: 200 })

    const result = await queryAdminSubscriptions(db, {})
    expect(result.total).toBe(2)
    expect(result.subscriptions.map((item) => item.id)).toEqual(['s2', 's1'])
    expect(result.subscriptions[0]?.email).toBe('u1@example.com')
  })

  it('按状态筛选', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedSubscription(sqlite, { id: 's1', status: 'active' })
    seedSubscription(sqlite, { id: 's2', status: 'canceled' })
    seedSubscription(sqlite, { id: 's3', status: 'active' })

    const active = await queryAdminSubscriptions(db, { status: 'active' })
    expect(active.subscriptions.map((item) => item.id)).toEqual(['s3', 's1'])
    expect(active.total).toBe(2)
  })

  it('分页只影响当页', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedSubscription(sqlite, { id: 's1', createdAt: 100 })
    seedSubscription(sqlite, { id: 's2', createdAt: 200 })
    seedSubscription(sqlite, { id: 's3', createdAt: 300 })

    const first = await queryAdminSubscriptions(db, { limit: 1, offset: 0 })
    expect(first.subscriptions.map((item) => item.id)).toEqual(['s3'])

    const second = await queryAdminSubscriptions(db, { limit: 1, offset: 1 })
    expect(second.subscriptions.map((item) => item.id)).toEqual(['s2'])
  })

  it('保留产品与计费周期字段', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedSubscription(sqlite, {
      id: 's1',
      productId: 'pro',
      offerId: 'yearly',
      amount: 9900,
      currency: 'usd',
      interval: 'year',
    })

    const result = await queryAdminSubscriptions(db, {})
    expect(result.subscriptions[0]?.productId).toBe('pro')
    expect(result.subscriptions[0]?.offerId).toBe('yearly')
    expect(result.subscriptions[0]?.interval).toBe('year')
    expect(result.subscriptions[0]?.amount).toBe(9900)
  })
})
