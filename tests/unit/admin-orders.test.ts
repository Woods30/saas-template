import { describe, expect, it } from 'vitest'
import { queryAdminOrders } from '../../src/modules/subscriptions/admin-orders'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 管理台订单列表。
 *
 * 三件事要钉住：状态筛选只认已定义的状态；分页按时间倒序且稳定；
 * 用户行缺失（外键未强制）时订单**不能丢**，邮箱留空即可。
 */

interface OrderSeed {
  id: string
  userId?: string | null
  status?: string
  amount?: number
  refundedAmount?: number
  currency?: string
  createdAt?: number
}

function seedOrder(sqlite: ReturnType<typeof createTestDatabase>['sqlite'], row: OrderSeed): void {
  sqlite
    .prepare(
      `INSERT INTO payments
        (id,user_id,provider,external_id,type,status,amount,refunded_amount,currency,product_id,description,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      row.id,
      row.userId ?? null,
      'stripe',
      `ext_${row.id}`,
      'subscription',
      row.status ?? 'paid',
      row.amount ?? 1000,
      row.refundedAmount ?? 0,
      row.currency ?? 'usd',
      'pro',
      'Pro plan',
      row.createdAt ?? 1,
    )
}

describe('管理台订单列表', () => {
  it('按时间倒序返回订单并带上买家邮箱', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, { id: 'p1', userId: 'u1', createdAt: 100 })
    seedOrder(sqlite, { id: 'p2', userId: 'u1', createdAt: 200 })

    const result = await queryAdminOrders(db, {})
    expect(result.total).toBe(2)
    expect(result.orders.map((order) => order.id)).toEqual(['p2', 'p1'])
    expect(result.orders[0]?.email).toBe('u1@example.com')
  })

  it('按状态筛选', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, { id: 'p1', status: 'paid' })
    seedOrder(sqlite, { id: 'p2', status: 'failed' })
    seedOrder(sqlite, { id: 'p3', status: 'refunded' })

    const paid = await queryAdminOrders(db, { status: 'paid' })
    expect(paid.orders.map((order) => order.id)).toEqual(['p1'])
    expect(paid.total).toBe(1)

    const all = await queryAdminOrders(db, { status: 'all' })
    expect(all.total).toBe(3)
  })

  it('分页只影响当页，total 不变', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, { id: 'p1', createdAt: 100 })
    seedOrder(sqlite, { id: 'p2', createdAt: 200 })
    seedOrder(sqlite, { id: 'p3', createdAt: 300 })

    const first = await queryAdminOrders(db, { limit: 2, offset: 0 })
    expect(first.orders.map((order) => order.id)).toEqual(['p3', 'p2'])
    expect(first.total).toBe(3)

    const second = await queryAdminOrders(db, { limit: 2, offset: 2 })
    expect(second.orders.map((order) => order.id)).toEqual(['p1'])
    expect(second.total).toBe(3)
  })

  it('买家已删除时订单仍展示，邮箱留空', async () => {
    const { sqlite, db } = createTestDatabase()
    // 支付行的 user_id 可空且「删用户置空」：用户删掉后订单行还在，收款记录不能丢。
    seedOrder(sqlite, { id: 'p1', userId: null })

    const result = await queryAdminOrders(db, {})
    expect(result.total).toBe(1)
    expect(result.orders[0]?.email).toBe('')
    expect(result.orders[0]?.userId).toBeNull()
  })

  it('金额与退款额原样返回', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, { id: 'p1', amount: 2500, refundedAmount: 500, currency: 'eur' })

    const result = await queryAdminOrders(db, {})
    expect(result.orders[0]?.amount).toBe(2500)
    expect(result.orders[0]?.refundedAmount).toBe(500)
    expect(result.orders[0]?.currency).toBe('eur')
  })
})
