import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it, vi } from 'vitest'

const notifications = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(true) }))
vi.mock('@/notification', () => ({ notify: notifications.notify }))

import { addBillingInterval, reviewOrder } from '@/collection/settlement'
import type { CollectionOrderStatus } from '@/collection/types'
import type { DB } from '@/db'

/** 核验时刻基准。 */
const T0 = new Date('2026-01-01T00:00:00.000Z')
/** 管理员账号。 */
const ADMIN = 'admin'
/** 标价（分）。 */
const BASE_AMOUNT = 18_000
/** 商品 / 付费方式。 */
const PRODUCT_ID = 'pro'
const OFFER_ID = 'monthly'

/** 内存 SQLite + 全迁移回放 + 可用的 Drizzle db。 */
function settlementDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/db/migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/db/migrations/${name}`, 'utf8'))
  }
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1),('admin','Admin','admin@example.com',1,1)",
  )
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) }
  })
  return { sqlite, db: db as unknown as DB }
}

interface OrderFixture {
  id?: string
  userId?: string
  productId?: string
  offerId?: string
  kind?: 'subscription' | 'one_time'
  interval?: string | null
  intervalCount?: number | null
  status?: CollectionOrderStatus
  /** 到期时间（秒）；默认一年后。 */
  expiresAt?: number
}

let sequence = 0

/** 直接写一行订单：结算测试要精确控制商品、周期与状态。 */
function insertOrder(
  sqlite: DatabaseSync,
  options: OrderFixture = {},
): { id: string; payable: number } {
  sequence += 1
  const id = options.id ?? `order-${sequence}`
  const fingerprint = sequence
  const payable = BASE_AMOUNT + fingerprint
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  sqlite
    .prepare(
      `INSERT INTO collection_orders(id,user_id,account_id,channel,product_id,offer_id,kind,interval,interval_count,base_amount,fingerprint,payable_amount,currency,status,expires_at,created_at,updated_at)
       VALUES (?, ?, 'acct-main', 'alipay', ?, ?, ?, ?, ?, ?, ?, ?, 'cny', ?, ?, ?, ?)`,
    )
    .run(
      id,
      options.userId ?? 'u1',
      options.productId ?? PRODUCT_ID,
      options.offerId ?? OFFER_ID,
      options.kind ?? 'one_time',
      options.interval ?? null,
      options.intervalCount ?? null,
      BASE_AMOUNT,
      fingerprint,
      payable,
      options.status ?? 'pending_verification',
      expiresAt,
      expiresAt,
      expiresAt,
    )
  return { id, payable }
}

/** 写一行外部渠道的订阅：用来制造占位冲突。 */
function insertSubscription(
  sqlite: DatabaseSync,
  options: {
    provider: string
    subscriptionId: string
    userId?: string
    productId?: string | null
    offerId?: string | null
    status?: string
    currentPeriodStart?: number
    currentPeriodEnd?: number
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO subscriptions(id,user_id,provider,subscription_id,status,product_id,offer_id,current_period_start,current_period_end,created_at,updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    )
    .run(
      `${options.provider}:${options.subscriptionId}`,
      options.userId ?? 'u1',
      options.provider,
      options.subscriptionId,
      options.status ?? 'active',
      options.productId ?? null,
      options.offerId ?? null,
      options.currentPeriodStart ?? null,
      options.currentPeriodEnd ?? null,
    )
}

function orderStatus(sqlite: DatabaseSync, id: string): string {
  const row = sqlite.prepare('SELECT status FROM collection_orders WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  return row?.status ?? ''
}

function orderRow(sqlite: DatabaseSync, id: string): Record<string, unknown> {
  return (
    (sqlite.prepare('SELECT * FROM collection_orders WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined) ?? {}
  )
}

function paymentRows(sqlite: DatabaseSync): Record<string, unknown>[] {
  return sqlite.prepare('SELECT * FROM payments').all() as Record<string, unknown>[]
}

function subscriptionRow(sqlite: DatabaseSync): Record<string, unknown> | undefined {
  return sqlite.prepare('SELECT * FROM subscriptions').get() as Record<string, unknown> | undefined
}

/** 让指定订单的「标记为已结算」这一步抛错一次，模拟结算中途崩溃。 */
function breakFinalSettlement(db: DB): void {
  const original = db.update.bind(db)
  let broken = false
  db.update = ((table: unknown) => {
    const builder = original(table as never)
    const set = builder.set.bind(builder)
    builder.set = ((values: Record<string, unknown>) => {
      if (!broken && values.status === 'settled') {
        broken = true
        throw new Error('结算中途失败')
      }
      return set(values as never)
    }) as typeof builder.set
    return builder
  }) as unknown as DB['update']
}

describe('核销订单结算', () => {
  it('普通核验金额不符时拒绝且不写付款记录', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    await expect(
      reviewOrder(
        db,
        {
          orderId: order.id,
          reviewerId: ADMIN,
          action: 'approve',
          observedAmount: order.payable + 1,
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' })
    expect(paymentRows(sqlite)).toHaveLength(0)
    expect(orderStatus(sqlite, order.id)).toBe('pending_verification')
    sqlite.close()
  })

  it('普通核验通过后写一条已支付付款记录并把订单置为已结算', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
        externalReference: 'flow-1',
      },
      T0,
    )
    expect(settled.status).toBe('settled')
    expect(settled.settledAt).not.toBeNull()
    expect(settled.observedAmount).toBe(order.payable)
    expect(settled.reviewedBy).toBe(ADMIN)
    expect(settled.externalReference).toBe('flow-1')

    const payments = paymentRows(sqlite)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      provider: 'collection',
      external_id: order.id,
      user_id: 'u1',
      type: 'one_time',
      status: 'paid',
      amount: order.payable,
      currency: 'cny',
      product_id: PRODUCT_ID,
      offer_id: OFFER_ID,
    })
    expect(orderStatus(sqlite, order.id)).toBe('settled')
    sqlite.close()
  })

  it('异常核验必须有理由', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    await expect(
      reviewOrder(
        db,
        {
          orderId: order.id,
          reviewerId: ADMIN,
          action: 'approve_exception',
          observedAmount: order.payable - 5,
          reviewNote: '   ',
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_NOTE' })
    expect(paymentRows(sqlite)).toHaveLength(0)
    expect(orderStatus(sqlite, order.id)).toBe('pending_verification')
    sqlite.close()
  })

  it('异常核验按实际金额写付款并保留理由', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve_exception',
        observedAmount: order.payable - 5,
        reviewNote: '用户少付 5 分，按实收结算',
      },
      T0,
    )
    expect(settled.status).toBe('settled')
    expect(settled.reviewNote).toBe('用户少付 5 分，按实收结算')
    const payments = paymentRows(sqlite)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({ status: 'paid', amount: order.payable - 5 })
    sqlite.close()
  })

  it('异常核验可以处理已过期但钱已到账的订单', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite, { status: 'expired' })
    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve_exception',
        observedAmount: order.payable,
        reviewNote: '订单已过期但钱已到账',
      },
      T0,
    )
    expect(settled.status).toBe('settled')
    expect(paymentRows(sqlite)).toHaveLength(1)
    sqlite.close()
  })

  it('一次性订单重复核验只生成一条付款记录', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    const input = {
      orderId: order.id,
      reviewerId: ADMIN,
      action: 'approve' as const,
      observedAmount: order.payable,
    }
    await reviewOrder(db, input, T0)
    const second = await reviewOrder(db, input, T0)
    expect(second.status).toBe('settled')
    expect(paymentRows(sqlite)).toHaveLength(1)
    sqlite.close()
  })

  it('驳回订单不写付款记录并落到已驳回状态', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    const rejected = await reviewOrder(
      db,
      { orderId: order.id, reviewerId: ADMIN, action: 'reject', reviewNote: '没查到这笔钱' },
      T0,
    )
    expect(rejected.status).toBe('rejected')
    expect(paymentRows(sqlite)).toHaveLength(0)
    expect(orderStatus(sqlite, order.id)).toBe('rejected')
    sqlite.close()
  })

  it('不存在的订单核验返回订单不存在', async () => {
    const { db, sqlite } = settlementDatabase()
    await expect(
      reviewOrder(db, { orderId: 'missing', reviewerId: ADMIN, action: 'approve' }, T0),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    sqlite.close()
  })
})

describe('核销订阅的手动续费', () => {
  it('没有当前订阅时从核验时间起算', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      T0,
    )
    const row = subscriptionRow(sqlite)
    const expectedEnd = Math.floor(addBillingInterval(T0, 'month', 1).getTime() / 1000)
    expect(row).toMatchObject({
      provider: 'collection',
      subscription_id: 'user:u1',
      status: 'active',
      product_id: PRODUCT_ID,
      offer_id: OFFER_ID,
      current_period_start: Math.floor(T0.getTime() / 1000),
      current_period_end: expectedEnd,
    })
    expect(row?.amount).toBe(order.payable)
    sqlite.close()
  })

  it('同 offer 手动续费从核验时间与当前周期结束时间的较晚者延长', async () => {
    const { db, sqlite } = settlementDatabase()
    const first = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    await reviewOrder(
      db,
      {
        orderId: first.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: first.payable,
      },
      T0,
    )
    const periodEnd = Math.floor(addBillingInterval(T0, 'month', 1).getTime() / 1000)

    // 第二笔在当前周期结束之前核验：周期必须从当前周期结束继续往后排。
    const second = insertOrder(sqlite, {
      kind: 'subscription',
      interval: 'month',
      intervalCount: 1,
    })
    const later = new Date(T0.getTime() + 24 * 3600 * 1000)
    await reviewOrder(
      db,
      {
        orderId: second.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: second.payable,
      },
      later,
    )
    const row = subscriptionRow(sqlite)
    const extendedEnd = Math.floor(
      addBillingInterval(new Date(periodEnd * 1000), 'month', 1).getTime() / 1000,
    )
    expect(row?.current_period_start).toBe(periodEnd)
    expect(row?.current_period_end).toBe(extendedEnd)
    sqlite.close()
  })

  it('1 月 31 日加一个月夹到 UTC 2 月末', () => {
    expect(addBillingInterval(new Date('2026-01-31T00:00:00.000Z'), 'month', 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    )
    expect(addBillingInterval(new Date('2024-01-31T00:00:00.000Z'), 'month', 1).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    )
    expect(addBillingInterval(new Date('2024-02-29T00:00:00.000Z'), 'year', 1).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z',
    )
    expect(addBillingInterval(new Date('2026-01-15T10:30:00.000Z'), 'month', 2).toISOString()).toBe(
      '2026-03-15T10:30:00.000Z',
    )
  })

  it('月末起算的订阅周期落在 UTC 2 月末', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    const january = new Date('2026-01-31T00:00:00.000Z')
    await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      january,
    )
    const row = subscriptionRow(sqlite)
    expect(new Date((row?.current_period_end as number) * 1000).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    )
    sqlite.close()
  })

  it('其它 provider 占位时转需退款且不写新的核销订阅', async () => {
    const { db, sqlite } = settlementDatabase()
    insertSubscription(sqlite, { provider: 'stripe', subscriptionId: 'sub_1' })
    const order = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      T0,
    )
    expect(settled.status).toBe('requires_refund')
    expect(orderStatus(sqlite, order.id)).toBe('requires_refund')
    expect(paymentRows(sqlite)).toHaveLength(0)
    const rows = sqlite.prepare('SELECT provider FROM subscriptions').all() as {
      provider: string
    }[]
    expect(rows.map((row) => row.provider)).toEqual(['stripe'])
    sqlite.close()
  })

  it('不同 offer 的核销订阅占位时转需退款', async () => {
    const { db, sqlite } = settlementDatabase()
    insertSubscription(sqlite, {
      provider: 'collection',
      subscriptionId: 'user:u1',
      productId: PRODUCT_ID,
      offerId: 'yearly',
    })
    const order = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      T0,
    )
    expect(settled.status).toBe('requires_refund')
    expect(paymentRows(sqlite)).toHaveLength(0)
    sqlite.close()
  })

  it('结算成功后同账号的重复订阅订单被取消或转需退款', async () => {
    const { db, sqlite } = settlementDatabase()
    const waiting = insertOrder(sqlite, {
      kind: 'subscription',
      interval: 'month',
      intervalCount: 1,
      status: 'pending_payment',
    })
    const duplicate = insertOrder(sqlite, {
      kind: 'subscription',
      interval: 'month',
      intervalCount: 1,
      status: 'pending_verification',
    })
    const current = insertOrder(sqlite, {
      kind: 'subscription',
      interval: 'month',
      intervalCount: 1,
    })
    await reviewOrder(
      db,
      {
        orderId: current.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: current.payable,
      },
      T0,
    )
    expect(orderStatus(sqlite, current.id)).toBe('settled')
    expect(orderStatus(sqlite, waiting.id)).toBe('canceled')
    expect(orderStatus(sqlite, duplicate.id)).toBe('requires_refund')
    sqlite.close()
  })
})

describe('结算崩溃恢复', () => {
  it('付款已落库但订单更新失败，重试只补订单状态', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    breakFinalSettlement(db)
    await expect(
      reviewOrder(
        db,
        {
          orderId: order.id,
          reviewerId: ADMIN,
          action: 'approve',
          observedAmount: order.payable,
        },
        T0,
      ),
    ).rejects.toThrow('结算中途失败')

    // 付款与订阅已经落库，订单还停在结算临界区。
    expect(paymentRows(sqlite)).toHaveLength(1)
    expect(orderStatus(sqlite, order.id)).toBe('settling')
    const periodEnd = subscriptionRow(sqlite)?.current_period_end

    const settled = await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      new Date(T0.getTime() + 3600 * 1000),
    )
    expect(settled.status).toBe('settled')
    expect(paymentRows(sqlite)).toHaveLength(1)
    // 续期只加一次：周期结束时间没有因为重试而再往后推。
    expect(subscriptionRow(sqlite)?.current_period_end).toBe(periodEnd)
    sqlite.close()
  })

  it('续期中途失败后重试不会重复续期', async () => {
    const { db, sqlite } = settlementDatabase()
    const first = insertOrder(sqlite, { kind: 'subscription', interval: 'month', intervalCount: 1 })
    await reviewOrder(
      db,
      {
        orderId: first.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: first.payable,
      },
      T0,
    )
    const periodEnd = Math.floor(addBillingInterval(T0, 'month', 1).getTime() / 1000)

    const second = insertOrder(sqlite, {
      kind: 'subscription',
      interval: 'month',
      intervalCount: 1,
    })
    breakFinalSettlement(db)
    await expect(
      reviewOrder(
        db,
        {
          orderId: second.id,
          reviewerId: ADMIN,
          action: 'approve',
          observedAmount: second.payable,
        },
        new Date(T0.getTime() + 24 * 3600 * 1000),
      ),
    ).rejects.toThrow('结算中途失败')
    expect(subscriptionRow(sqlite)?.current_period_end).toBe(
      Math.floor(addBillingInterval(new Date(periodEnd * 1000), 'month', 1).getTime() / 1000),
    )

    await reviewOrder(
      db,
      {
        orderId: second.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: second.payable,
      },
      new Date(T0.getTime() + 48 * 3600 * 1000),
    )
    expect(paymentRows(sqlite)).toHaveLength(2)
    expect(subscriptionRow(sqlite)?.current_period_end).toBe(
      Math.floor(addBillingInterval(new Date(periodEnd * 1000), 'month', 1).getTime() / 1000),
    )
    expect(orderStatus(sqlite, second.id)).toBe('settled')
    sqlite.close()
  })
})

describe('核销订单审核留痕', () => {
  it('核验结果写回订单的观察金额、审核人与审核时间', async () => {
    const { db, sqlite } = settlementDatabase()
    const order = insertOrder(sqlite)
    await reviewOrder(
      db,
      {
        orderId: order.id,
        reviewerId: ADMIN,
        action: 'approve',
        observedAmount: order.payable,
      },
      T0,
    )
    const row = orderRow(sqlite, order.id)
    expect(row.observed_amount).toBe(order.payable)
    expect(row.reviewed_by).toBe(ADMIN)
    expect(row.reviewed_at).toBe(Math.floor(T0.getTime() / 1000))
    expect(row.settled_at).toBe(Math.floor(T0.getTime() / 1000))
    sqlite.close()
  })
})
