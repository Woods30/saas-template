import { describe, expect, it } from 'vitest'
import { getFunnelReport } from '../../src/modules/subscriptions/admin-funnel'
import { createTestDatabase } from '../helpers/database'

/**
 * 转化漏斗。
 *
 * 要钉住的口径：cohort 只含窗口内注册的用户；`checkouts` 只看 `orders`
 * （续费不写 orders，自然排除）；退款仍算「付过款」；分组维度的空串归一为
 * `direct`，筛选 `direct` 时匹配 `''`。计数用 distinct users，一个用户下多笔
 * 订单 / 付款不能重复计入。
 */

type Sqlite = ReturnType<typeof createTestDatabase>['sqlite']

const DAY = 86_400

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

interface UserSeed {
  createdAt?: number
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  referrer?: string
  country?: string
}

function seedUser(sqlite: Sqlite, id: string, seed: UserSeed = {}): void {
  const createdAt = seed.createdAt ?? nowSeconds()
  sqlite
    .prepare(
      `INSERT INTO users
        (id,name,email,utm_source,utm_medium,utm_campaign,utm_term,utm_content,referrer,country,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      'User',
      `${id}@example.com`,
      seed.utmSource ?? '',
      seed.utmMedium ?? '',
      seed.utmCampaign ?? '',
      seed.utmTerm ?? '',
      seed.utmContent ?? '',
      seed.referrer ?? '',
      seed.country ?? '',
      createdAt,
      createdAt,
    )
}

function seedOrder(sqlite: Sqlite, id: string, userId: string, createdAt = nowSeconds()): void {
  sqlite
    .prepare(
      `INSERT INTO orders
        (id,order_no,user_id,provider,mode,product_id,offer_id,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      `ord_${id}`,
      userId,
      'stripe',
      'subscription',
      'pro',
      'monthly',
      'created',
      createdAt,
      createdAt,
    )
}

function seedPayment(
  sqlite: Sqlite,
  id: string,
  userId: string,
  seed: { status?: string; createdAt?: number } = {},
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
      1000,
      0,
      'usd',
      createdAt,
    )
}

describe('转化漏斗', () => {
  it('窗口内注册的用户计入 signups', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'fresh', { createdAt: nowSeconds() - DAY })
    seedUser(sqlite, 'stale', { createdAt: nowSeconds() - 40 * DAY })

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.totals).toEqual({ signups: 1, checkouts: 0, paid: 0 })
    expect(report.rows).toEqual([{ value: 'direct', signups: 1, checkouts: 0, paid: 0 }])
  })

  it('创建过结账但未付款只计入 checkouts', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, 'o1', 'u1')

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.totals).toEqual({ signups: 1, checkouts: 1, paid: 0 })
  })

  it('退款用户仍计入 paid', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedPayment(sqlite, 'p1', 'u1', { status: 'refunded' })

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.totals).toEqual({ signups: 1, checkouts: 0, paid: 1 })
  })

  it('部分退款与已支付一样计入 paid，失败支付不计入', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'paid')
    seedUser(sqlite, 'partial')
    seedUser(sqlite, 'failed')
    seedPayment(sqlite, 'p1', 'paid', { status: 'paid' })
    seedPayment(sqlite, 'p2', 'partial', { status: 'partially_refunded' })
    seedPayment(sqlite, 'p3', 'failed', { status: 'failed' })

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.totals.paid).toBe(2)
  })

  it('同一用户多笔订单与付款只计一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedOrder(sqlite, 'o1', 'u1')
    seedOrder(sqlite, 'o2', 'u1')
    seedPayment(sqlite, 'p1', 'u1', { status: 'paid' })
    seedPayment(sqlite, 'p2', 'u1', { status: 'refunded' })

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.totals).toEqual({ signups: 1, checkouts: 1, paid: 1 })
  })

  it('按 utm_source 分组，空值归一为 direct', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'google', { utmSource: 'google' })
    seedUser(sqlite, 'organic')

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    const byValue = Object.fromEntries(report.rows.map((row) => [row.value, row]))
    expect(byValue.google).toEqual({ value: 'google', signups: 1, checkouts: 0, paid: 0 })
    expect(byValue.direct).toEqual({ value: 'direct', signups: 1, checkouts: 0, paid: 0 })
  })

  it('筛选 direct 时匹配空串，筛选具体值时只保留该值', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'google', { utmSource: 'google' })
    seedUser(sqlite, 'organic')

    const direct = await getFunnelReport(db, {
      range: '7d',
      groupBy: 'utm_source',
      filters: { utm_source: 'direct' },
    })
    expect(direct.totals.signups).toBe(1)
    expect(direct.rows.map((row) => row.value)).toEqual(['direct'])

    const google = await getFunnelReport(db, {
      range: '7d',
      groupBy: 'utm_source',
      filters: { utm_source: 'google' },
    })
    expect(google.totals.signups).toBe(1)
    expect(google.rows).toEqual([{ value: 'google', signups: 1, checkouts: 0, paid: 0 }])
  })

  it('options 对每个维度只取非空值', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1', { utmSource: 'google', utmMedium: 'cpc', country: 'US' })
    seedUser(sqlite, 'u2')

    const report = await getFunnelReport(db, { range: '7d', groupBy: 'utm_source' })

    expect(report.options.utm_source).toEqual(['google'])
    expect(report.options.utm_medium).toEqual(['cpc'])
    expect(report.options.country).toEqual(['US'])
    expect(report.options.utm_campaign).toEqual([])
  })
})
