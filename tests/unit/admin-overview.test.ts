import { describe, expect, it } from 'vitest'
import { queryAdminOverview } from '../../src/modules/subscriptions/admin-overview'
import { createTestDatabase } from '../helpers/database'

/**
 * 管理台概览。
 *
 * 要钉住的事：KPI 各口径（总用户 / 24h 新增 / 30 天营收 / 活跃订阅 / 待核销）、
 * 漏斗、最近付款与待办一次返回；30 天窗口外的付款不计入营收，失败支付不计入
 * 营收；最近付款按时间倒序，便于「最近发生了什么」。
 */

type Sqlite = ReturnType<typeof createTestDatabase>['sqlite']

const DAY = 86_400

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function seedUser(sqlite: Sqlite, id: string, createdAt = nowSeconds()): void {
  sqlite
    .prepare('INSERT INTO users(id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(id, 'User', `${id}@example.com`, createdAt, createdAt)
}

function seedPayment(
  sqlite: Sqlite,
  id: string,
  userId: string | null,
  seed: {
    status?: string
    amount?: number
    refundedAmount?: number
    currency?: string
    createdAt?: number
  } = {},
): void {
  const createdAt = seed.createdAt ?? nowSeconds()
  sqlite
    .prepare(
      `INSERT INTO payments
        (id,user_id,provider,external_id,type,status,amount,refunded_amount,currency,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      userId,
      'stripe',
      `ext_${id}`,
      'subscription',
      seed.status ?? 'paid',
      seed.amount ?? 1000,
      seed.refundedAmount ?? 0,
      seed.currency ?? 'usd',
      createdAt,
    )
}

function seedSubscription(sqlite: Sqlite, id: string, userId: string, status: string): void {
  sqlite
    .prepare(
      `INSERT INTO subscriptions
        (id,user_id,provider,subscription_id,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(id, userId, 'stripe', `sub_${id}`, status, nowSeconds(), nowSeconds())
}

function seedManualReview(
  sqlite: Sqlite,
  orderId: string,
  userId: string,
  status: string,
  payableAmount: number,
): void {
  sqlite
    .prepare(
      `INSERT INTO orders
        (id,order_no,user_id,provider,mode,product_id,offer_id,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      orderId,
      `ord_${orderId}`,
      userId,
      'manual_payments',
      'payment',
      'pro',
      'once',
      'open',
      nowSeconds(),
      nowSeconds(),
    )
  // 尾数索引 (account_id, payable_amount) 在「进行中」状态上唯一，两笔待处理订单要用不同金额。
  sqlite
    .prepare(
      `INSERT INTO manual_payment_details
        (order_id,user_id,account_id,channel,base_amount,fingerprint,payable_amount,currency,status,expires_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      orderId,
      userId,
      'acc_1',
      'alipay',
      1000,
      payableAmount,
      payableAmount,
      'usd',
      status,
      nowSeconds() + DAY,
      nowSeconds(),
      nowSeconds(),
    )
}

function seedTicket(sqlite: Sqlite, id: string, userId: string, status: string): void {
  sqlite
    .prepare(
      `INSERT INTO tickets(id,user_id,subject,category,priority,content,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, userId, 'Help', 'general', 'normal', 'body', status, nowSeconds(), nowSeconds())
}

describe('管理台概览', () => {
  it('概览返回 KPI、漏斗、最近付款与待办', async () => {
    const { sqlite, db } = createTestDatabase()
    const fresh = nowSeconds() - 3600
    const tenDaysAgo = nowSeconds() - 10 * DAY
    const fortyDaysAgo = nowSeconds() - 40 * DAY
    seedUser(sqlite, 'new', fresh)
    seedUser(sqlite, 'old', tenDaysAgo)

    // 30 天内的营收：1000 全额 + 2000 退 500（净额 1500）；30 天外与失败都不计入。
    seedPayment(sqlite, 'p1', 'new', { amount: 1000, currency: 'usd', createdAt: tenDaysAgo })
    seedPayment(sqlite, 'p2', 'old', {
      amount: 2000,
      refundedAmount: 500,
      currency: 'usd',
      status: 'partially_refunded',
      createdAt: tenDaysAgo,
    })
    seedPayment(sqlite, 'old', 'old', { amount: 9999, currency: 'usd', createdAt: fortyDaysAgo })
    seedPayment(sqlite, 'failed', 'new', { status: 'failed', amount: 500, createdAt: fresh })

    seedSubscription(sqlite, 's1', 'new', 'active')
    seedSubscription(sqlite, 's2', 'old', 'canceled')
    // 仍占名额但已不在计费中：不计入对外展示的「活跃订阅」。
    seedSubscription(sqlite, 's3', 'old', 'paused')
    seedManualReview(sqlite, 'm1', 'new', 'pending_verification', 1001)
    seedManualReview(sqlite, 'm2', 'new', 'pending_payment', 1002)
    seedTicket(sqlite, 't1', 'new', 'open')
    seedTicket(sqlite, 't2', 'new', 'replied')

    const overview = await queryAdminOverview(db)

    expect(overview.users).toEqual({ total: 2, new24h: 1 })
    // 净额：1000 + (2000 - 500) = 2500。
    expect(overview.revenue30d).toEqual({ amount: 2500, currency: 'usd' })
    expect(overview.activeSubscriptions).toBe(1)
    expect(overview.pendingManualReviews).toBe(1)
    expect(overview.funnel.totals.signups).toBe(2)
    // 最近 5 笔、倒序；同秒付款用 id 作稳定的次序键。
    expect(overview.recentPayments.map((payment) => payment.id)).toEqual([
      'failed',
      'p2',
      'p1',
      'old',
    ])
    expect(overview.todos).toEqual({
      pendingManualReviews: 1,
      openTickets: 1,
      failedPayments24h: 1,
    })
  })

  it('最近付款有上限且按时间倒序', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    for (let i = 0; i < 8; i++) {
      seedPayment(sqlite, `p${i}`, 'u1', { createdAt: nowSeconds() - i })
    }

    const overview = await queryAdminOverview(db)

    expect(overview.recentPayments).toHaveLength(5)
    expect(overview.recentPayments.map((payment) => payment.id)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
    ])
  })
})
