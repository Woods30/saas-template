import { describe, expect, it } from 'vitest'
import { queryAdminPayments } from '../../src/modules/subscriptions/admin-orders'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 管理台付款列表。
 *
 * 要钉住的事：类型 tab 把「订阅 / 一次性 / 人工核销」分档且 one_time 排除人工核销；
 * 状态筛选与类型筛选叠加；状态筛选只认已定义的状态；分页按时间倒序且稳定；
 * 用户行缺失（外键未强制）时付款**不能丢**，邮箱留空即可。
 */

interface PaymentSeed {
  id: string
  userId?: string | null
  provider?: string
  type?: 'subscription' | 'one_time'
  status?: string
  amount?: number
  refundedAmount?: number
  currency?: string
  createdAt?: number
}

function seedPayment(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  row: PaymentSeed,
): void {
  sqlite
    .prepare(
      `INSERT INTO payments
        (id,user_id,provider,external_id,type,status,amount,refunded_amount,currency,product_id,description,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      row.id,
      row.userId ?? null,
      row.provider ?? 'stripe',
      `ext_${row.id}`,
      row.type ?? 'subscription',
      row.status ?? 'paid',
      row.amount ?? 1000,
      row.refundedAmount ?? 0,
      row.currency ?? 'usd',
      'pro',
      'Pro plan',
      row.createdAt ?? 1,
    )
}

describe('管理台付款列表', () => {
  it('按时间倒序返回订单并带上买家邮箱', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedPayment(sqlite, { id: 'p1', userId: 'u1', createdAt: 100 })
    seedPayment(sqlite, { id: 'p2', userId: 'u1', createdAt: 200 })

    const result = await queryAdminPayments(db, {})
    expect(result.total).toBe(2)
    expect(result.orders.map((order) => order.id)).toEqual(['p2', 'p1'])
    expect(result.orders[0]?.email).toBe('u1@example.com')
  })

  it('按状态筛选', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedPayment(sqlite, { id: 'p1', status: 'paid' })
    seedPayment(sqlite, { id: 'p2', status: 'failed' })
    seedPayment(sqlite, { id: 'p3', status: 'refunded' })

    const paid = await queryAdminPayments(db, { status: 'paid' })
    expect(paid.orders.map((order) => order.id)).toEqual(['p1'])
    expect(paid.total).toBe(1)

    const all = await queryAdminPayments(db, { status: 'all' })
    expect(all.total).toBe(3)
  })

  it('分页只影响当页，total 不变', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedPayment(sqlite, { id: 'p1', createdAt: 100 })
    seedPayment(sqlite, { id: 'p2', createdAt: 200 })
    seedPayment(sqlite, { id: 'p3', createdAt: 300 })

    const first = await queryAdminPayments(db, { limit: 2, offset: 0 })
    expect(first.orders.map((order) => order.id)).toEqual(['p3', 'p2'])
    expect(first.total).toBe(3)

    const second = await queryAdminPayments(db, { limit: 2, offset: 2 })
    expect(second.orders.map((order) => order.id)).toEqual(['p1'])
    expect(second.total).toBe(3)
  })

  it('买家已删除时订单仍展示，邮箱留空', async () => {
    const { sqlite, db } = createTestDatabase()
    // 支付行的 user_id 可空且「删用户置空」：用户删掉后订单行还在，收款记录不能丢。
    seedPayment(sqlite, { id: 'p1', userId: null })

    const result = await queryAdminPayments(db, {})
    expect(result.total).toBe(1)
    expect(result.orders[0]?.email).toBe('')
    expect(result.orders[0]?.userId).toBeNull()
  })

  it('金额与退款额原样返回', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedPayment(sqlite, { id: 'p1', amount: 2500, refundedAmount: 500, currency: 'eur' })

    const result = await queryAdminPayments(db, {})
    expect(result.orders[0]?.amount).toBe(2500)
    expect(result.orders[0]?.refundedAmount).toBe(500)
    expect(result.orders[0]?.currency).toBe('eur')
  })

  it('无法归属订单的付款行 orderId 为空', async () => {
    const { sqlite, db } = createTestDatabase()
    seedPayment(sqlite, { id: 'p1' })

    const result = await queryAdminPayments(db, {})
    expect(result.orders[0]?.orderId).toBeNull()
  })
})

describe('付款类型 tab', () => {
  /** 三种档位各一条：订阅、渠道一次性、人工核销，时间倒序便于断言顺序。 */
  function seedMixed(sqlite: ReturnType<typeof createTestDatabase>['sqlite']): void {
    seedPayment(sqlite, { id: 'sub', type: 'subscription', provider: 'stripe', createdAt: 300 })
    seedPayment(sqlite, { id: 'once', type: 'one_time', provider: 'stripe', createdAt: 200 })
    seedPayment(sqlite, {
      id: 'manual',
      type: 'one_time',
      provider: 'manual_payments',
      createdAt: 100,
    })
  }

  it('subscription tab 只返回订阅付款', async () => {
    const { sqlite, db } = createTestDatabase()
    seedMixed(sqlite)

    const result = await queryAdminPayments(db, { tab: 'subscription' })
    expect(result.orders.map((order) => order.id)).toEqual(['sub'])
    expect(result.total).toBe(1)
  })

  it('one_time tab 排除人工核销付款', async () => {
    const { sqlite, db } = createTestDatabase()
    seedMixed(sqlite)

    const result = await queryAdminPayments(db, { tab: 'one_time' })
    expect(result.orders.map((order) => order.id)).toEqual(['once'])
    expect(result.total).toBe(1)
  })

  it('manual_payments tab 只返回人工核销付款', async () => {
    const { sqlite, db } = createTestDatabase()
    seedMixed(sqlite)

    const result = await queryAdminPayments(db, { tab: 'manual_payments' })
    expect(result.orders.map((order) => order.id)).toEqual(['manual'])
    expect(result.total).toBe(1)
  })

  it('人工核销的订阅型付款只出现在 manual_payments tab，不重复计入 subscription', async () => {
    const { sqlite, db } = createTestDatabase()
    // 核销链路按商品类型也写 `type = 'subscription'`；四档必须是划分而非重叠视图。
    seedPayment(sqlite, {
      id: 'manual_sub',
      type: 'subscription',
      provider: 'manual_payments',
      createdAt: 100,
    })

    const subscription = await queryAdminPayments(db, { tab: 'subscription' })
    expect(subscription.orders).toEqual([])
    expect(subscription.total).toBe(0)

    const manual = await queryAdminPayments(db, { tab: 'manual_payments' })
    expect(manual.orders.map((order) => order.id)).toEqual(['manual_sub'])
    expect(manual.total).toBe(1)
  })

  it('状态筛选与类型筛选叠加', async () => {
    const { sqlite, db } = createTestDatabase()
    seedPayment(sqlite, { id: 'sub_paid', type: 'subscription', status: 'paid', createdAt: 300 })
    seedPayment(sqlite, {
      id: 'sub_failed',
      type: 'subscription',
      status: 'failed',
      createdAt: 200,
    })
    seedPayment(sqlite, { id: 'once_paid', type: 'one_time', status: 'paid', createdAt: 100 })

    const result = await queryAdminPayments(db, { tab: 'subscription', status: 'paid' })
    expect(result.orders.map((order) => order.id)).toEqual(['sub_paid'])
    expect(result.total).toBe(1)
  })
})
