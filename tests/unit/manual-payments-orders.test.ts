import { getTableColumns } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 价格解析打桩：核销链路的金额事实源在商品配置里，测试要断言的是
 * 「标价 + 尾数」这条规则，不该被出厂配置的具体金额牵着走。
 */
const productMocks = vi.hoisted(() => ({
  resolveManualPaymentPrice: vi.fn(),
}))

vi.mock('@/config/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/products')>()
  return { ...actual, resolveManualPaymentPrice: productMocks.resolveManualPaymentPrice }
})

import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/core/db'
import { resolveManualPaymentAccount } from '@/modules/manual-payments/accounts'
import {
  cancelOrder,
  createOrder,
  expirePendingOrders,
  getUserOrder,
  listAllOrders,
  listUserOrders,
  MANUAL_PAYMENT_ORDER_TTL_SECONDS,
  submitOrder,
} from '@/modules/manual-payments/orders'
import type { ManualPaymentAccountConfig } from '@/modules/manual-payments/types'
import { createTestDatabase } from '../helpers/database'

/**
 * 核销订单：金额分配、惰性过期与用户侧状态机。
 *
 * 用的都是真 SQLite（`tests/helpers/database.ts` 回放迁移）——尾数的唯一性靠
 * partial unique index 判定，假 db 验不出来。
 *
 * 订单由两行组成：`orders`（购买意图）与 `manual_payment_details`（核销专有字段）。
 */

// --- 表结构 ------------------------------------------------------------------

/**
 * 索引列名。
 *
 * drizzle 的 `IndexColumn` 类型把 `SQL` 表达式也算进去，但表定义里写的都是具名
 * 列——只取带 `name` 的那一支。
 */
function indexColumnNames(columns: readonly unknown[]): string[] {
  return columns.map((column) =>
    typeof column === 'object' && column !== null && 'name' in column
      ? String((column as { name: unknown }).name)
      : String(column),
  )
}

describe('核销型支付的数据表', () => {
  it('收款账户表与核销详情表的列与规格一致', () => {
    expect(Object.keys(getTableColumns(schema.manualPaymentAccounts))).toEqual([
      'id',
      'channel',
      'displayName',
      'currency',
      'qrImageKey',
      'enabled',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ])
    expect(Object.keys(getTableColumns(schema.manualPaymentDetails))).toEqual([
      'orderId',
      'userId',
      'accountId',
      'channel',
      'qrImageUrl',
      'qrImageKey',
      'baseAmount',
      'fingerprint',
      'payableAmount',
      'currency',
      'status',
      'payerNote',
      'receiptKey',
      'submittedAt',
      'observedAmount',
      'externalReference',
      'reviewNote',
      'reviewedBy',
      'reviewedAt',
      'expiresAt',
      'settledAt',
      'createdAt',
      'updatedAt',
    ])
  })

  it('活跃金额唯一索引覆盖收款账户与应付金额两列', () => {
    const config = getTableConfig(schema.manualPaymentDetails)
    const index = config.indexes.find(
      (item) => item.config?.name === 'manual_payment_details_active_amount_unique',
    )
    expect(index ? indexColumnNames(index.config?.columns ?? []) : []).toEqual([
      'account_id',
      'payable_amount',
    ])
    expect(index?.config?.where).toBeDefined()
  })

  it('结算临界区唯一索引限制同一用户只能有一个 settling 订单', () => {
    const config = getTableConfig(schema.manualPaymentDetails)
    const index = config.indexes.find(
      (item) => item.config?.name === 'manual_payment_details_settling_user_unique',
    )
    expect(index ? indexColumnNames(index.config?.columns ?? []) : []).toEqual(['user_id'])
    expect(index?.config?.where).toBeDefined()
  })

  it('订单列表与惰性过期索引存在', () => {
    const config = getTableConfig(schema.manualPaymentDetails)
    const byUser = config.indexes.find(
      (item) => item.config?.name === 'manual_payment_details_user_status_idx',
    )
    const byExpiry = config.indexes.find(
      (item) => item.config?.name === 'manual_payment_details_status_expires_idx',
    )
    expect(byUser ? indexColumnNames(byUser.config?.columns ?? []) : []).toEqual([
      'user_id',
      'status',
    ])
    expect(byExpiry ? indexColumnNames(byExpiry.config?.columns ?? []) : []).toEqual([
      'status',
      'expires_at',
    ])
  })

  it('活跃金额唯一索引只约束三种活跃状态', () => {
    const { sqlite } = createTestDatabase()
    sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1)",
    )
    const insert = (id: string, status: string, amount: number) => {
      insertOrderRow(sqlite, id)
      sqlite
        .prepare(
          `INSERT INTO manual_payment_details(order_id,user_id,account_id,channel,base_amount,fingerprint,payable_amount,currency,status,expires_at)
           VALUES (?, 'u1', 'acct', 'alipay', ?, 1, ?, 'cny', ?, 1)`,
        )
        .run(id, amount - 1, amount, status)
    }

    insert('a', 'pending_payment', 1000)
    expect(() => insert('b', 'pending_verification', 1000)).toThrow(/UNIQUE/)
    expect(() => insert('c', 'settling', 1000)).toThrow(/UNIQUE/)
    // 非活跃状态不占坑，同一金额可再次使用。
    expect(() => insert('d', 'expired', 1000)).not.toThrow()
    expect(() => insert('e', 'settled', 1000)).not.toThrow()
    sqlite.close()
  })

  it('结算临界区唯一索引限制同一用户只能有一个 settling 订单', () => {
    const { sqlite } = createTestDatabase()
    sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1)",
    )
    const insert = (id: string, userId: string, amount: number) => {
      insertOrderRow(sqlite, id, userId)
      sqlite
        .prepare(
          `INSERT INTO manual_payment_details(order_id,user_id,account_id,channel,base_amount,fingerprint,payable_amount,currency,status,expires_at)
           VALUES (?, ?, 'acct', 'alipay', ?, 1, ?, 'cny', 'settling', 1)`,
        )
        .run(id, userId, amount - 1, amount)
    }

    insert('a', 'u1', 1000)
    expect(() => insert('b', 'u1', 1001)).toThrow(/UNIQUE/)
    expect(() => insert('c', 'u2', 1002)).not.toThrow()
    sqlite.close()
  })
})

// --- 收款账户解析与金额分配 ---------------------------------------------------

/** 夹具里的标价（分）与商品 / 付费方式标识。 */
const BASE_AMOUNT = 18_000
const PRODUCT_ID = 'pro'
const OFFER_ID = 'monthly'

const ACCOUNT_CONFIG: ManualPaymentAccountConfig = {
  id: 'acct-main',
  channel: 'alipay',
  displayName: '配置账户',
  currency: 'cny',
  qrImageUrl: '/manual-payments/main.png',
}

const OTHER_ACCOUNT_CONFIG: ManualPaymentAccountConfig = {
  id: 'acct-other',
  channel: 'alipay',
  displayName: '备用账户',
  currency: 'cny',
  qrImageUrl: '/manual-payments/other.png',
}

/** 内存 SQLite + 全迁移回放 + 可用的 Drizzle db。 */
function manualPaymentDatabase() {
  const { sqlite, db } = createTestDatabase()
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1)",
  )
  return { sqlite, db }
}

/** 写一行 `orders`：核销详情的父行。 */
function insertOrderRow(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  id: string,
  userId = 'u1',
  status = 'open',
): void {
  sqlite
    .prepare(
      `INSERT INTO orders(id,order_no,user_id,provider,mode,product_id,offer_id,status,created_at,updated_at)
       VALUES (?, ?, ?, 'manual_payments', 'payment', ?, ?, ?, 1, 1)`,
    )
    .run(id, `ord_test_${id}`, userId, PRODUCT_ID, OFFER_ID, status)
}

/** 直接写一行核销详情：用来占住尾数，模拟「别的请求已经占了这个金额」。 */
function occupy(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  options: {
    id: string
    fingerprint: number
    status?: string
    accountId?: string
    userId?: string
    /** 到期时间；默认一年后。 */
    expiresAt?: number
  },
): void {
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  insertOrderRow(sqlite, options.id, options.userId ?? 'u1')
  sqlite
    .prepare(
      `INSERT INTO manual_payment_details(order_id,user_id,account_id,channel,base_amount,fingerprint,payable_amount,currency,status,expires_at,created_at,updated_at)
       VALUES (?, ?, ?, 'alipay', ?, ?, ?, 'cny', ?, ?, ?, ?)`,
    )
    .run(
      options.id,
      options.userId ?? 'u1',
      options.accountId ?? 'acct-main',
      BASE_AMOUNT,
      options.fingerprint,
      BASE_AMOUNT + options.fingerprint,
      options.status ?? 'pending_payment',
      expiresAt,
      expiresAt,
      expiresAt,
    )
}

function detailStatus(sqlite: ReturnType<typeof createTestDatabase>['sqlite'], id: string): string {
  const row = sqlite
    .prepare('SELECT status FROM manual_payment_details WHERE order_id = ?')
    .get(id) as { status: string } | undefined
  return row?.status ?? ''
}

function orderStatus(sqlite: ReturnType<typeof createTestDatabase>['sqlite'], id: string): string {
  const row = sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  return row?.status ?? ''
}

/** 让指定终态（默认 `canceled`）的订单状态回写抛错一次。 */
function breakOrderStatusSync(db: DB, target: string = 'canceled'): void {
  const original = db.update.bind(db)
  let broken = false
  db.update = ((table: unknown) => {
    const builder = original(table as never)
    // 只拦 `orders` 表的回写；详情表也会写相同的终态值。
    if (table !== schema.orders) return builder
    const set = builder.set.bind(builder)
    builder.set = ((values: Record<string, unknown>) => {
      if (!broken && values.status === target) {
        broken = true
        throw new Error('订单状态同步失败')
      }
      return set(values as never)
    }) as typeof builder.set
    return builder
  }) as unknown as DB['update']
}

/** 把随机起点固定下来，让环形扫描的顺序可断言。 */
function forceFingerprintStart(value: number): void {
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    ;(array as Uint8Array)[0] = value
    return array
  })
}

const originalAccounts = websiteConfig.manualPayments.accounts

beforeEach(() => {
  productMocks.resolveManualPaymentPrice.mockReturnValue({
    amount: BASE_AMOUNT,
    currency: 'cny',
    kind: 'one_time',
  })
  websiteConfig.manualPayments.accounts = [ACCOUNT_CONFIG]
})

afterEach(() => {
  websiteConfig.manualPayments.accounts = originalAccounts
  vi.restoreAllMocks()
})

describe('收款账户解析', () => {
  it('没有数据库记录时用源码配置兜底', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const account = await resolveManualPaymentAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toEqual({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '配置账户',
      currency: 'cny',
      qrImageUrl: '/manual-payments/main.png',
      qrImageKey: null,
    })
    sqlite.close()
  })

  it('数据库里的运营记录按 ID 覆盖配置', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await db.insert(schema.manualPaymentAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '运营改过的名字',
      currency: 'cny',
      qrImageKey: 'manual-payment-qrcodes/main.png',
      enabled: true,
    })
    const account = await resolveManualPaymentAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toMatchObject({
      id: 'acct-main',
      displayName: '运营改过的名字',
      qrImageKey: 'manual-payment-qrcodes/main.png',
    })
    sqlite.close()
  })

  it('数据库里没有对应配置的账户 ID 不参与解析', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await db.insert(schema.manualPaymentAccounts).values({
      id: 'acct-stranger',
      channel: 'alipay',
      displayName: '陌生账户',
      currency: 'cny',
      enabled: true,
    })
    const account = await resolveManualPaymentAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account?.id).toBe('acct-main')
    sqlite.close()
  })

  it('被禁用的账户被跳过并继续找下一个', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await db.insert(schema.manualPaymentAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '主账户',
      currency: 'cny',
      enabled: false,
    })
    const account = await resolveManualPaymentAccount(db, {
      accounts: [ACCOUNT_CONFIG, OTHER_ACCOUNT_CONFIG],
    })
    expect(account?.id).toBe('acct-other')
    sqlite.close()
  })

  it('全部账户被禁用时没有可用账户', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await db.insert(schema.manualPaymentAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '主账户',
      currency: 'cny',
      enabled: false,
    })
    const account = await resolveManualPaymentAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toBeNull()
    sqlite.close()
  })
})

describe('核销订单金额分配', () => {
  it('没有可用账户时抛 NO_MANUAL_PAYMENT_ACCOUNT', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    websiteConfig.manualPayments.accounts = []
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'NO_MANUAL_PAYMENT_ACCOUNT' })
    sqlite.close()
  })

  it('商品没有核销价格时抛 INVALID_OFFER', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    productMocks.resolveManualPaymentPrice.mockReturnValue(undefined)
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'INVALID_OFFER' })
    sqlite.close()
  })

  it('创建订单同时写 orders 与 manual_payment_details', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })

    // 领域视图带出对外订单号。
    expect(order.orderNo).toMatch(/^ord_\d{14}_[A-Z0-9]{8}$/)

    const intent = sqlite
      .prepare('SELECT order_no, provider, mode, status, user_id FROM orders WHERE id = ?')
      .get(order.id) as {
      order_no: string
      provider: string
      mode: string
      status: string
      user_id: string
    }
    expect(intent).toMatchObject({
      order_no: order.orderNo,
      provider: 'manual_payments',
      mode: 'payment',
      status: 'open',
      user_id: 'u1',
    })

    const detail = sqlite
      .prepare(
        'SELECT user_id, status, payable_amount, fingerprint FROM manual_payment_details WHERE order_id = ?',
      )
      .get(order.id) as {
      user_id: string
      status: string
      payable_amount: number
      fingerprint: number
    }
    expect(detail).toMatchObject({
      user_id: 'u1',
      status: 'pending_payment',
      payable_amount: order.payableAmount,
      fingerprint: order.fingerprint,
    })
    sqlite.close()
  })

  it('应付金额等于标价加尾数且尾数落在 1 到 99', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBeGreaterThanOrEqual(1)
    expect(order.fingerprint).toBeLessThanOrEqual(99)
    expect(order.payableAmount).toBe(BASE_AMOUNT + order.fingerprint)
    expect(order.baseAmount).toBe(BASE_AMOUNT)
    sqlite.close()
  })

  it('订单快照收款账户与价格字段，有效期是创建时间加 15 分钟', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const order = await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      now,
    )
    expect(order).toMatchObject({
      userId: 'u1',
      accountId: 'acct-main',
      channel: 'alipay',
      qrImageUrl: '/manual-payments/main.png',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
      kind: 'one_time',
      currency: 'cny',
      status: 'pending_payment',
    })
    expect(order.expiresAt.getTime()).toBe(now.getTime() + MANUAL_PAYMENT_ORDER_TTL_SECONDS * 1000)
    expect(MANUAL_PAYMENT_ORDER_TTL_SECONDS).toBe(15 * 60)
    // D1 的 timestamp 列是整数秒：存的是裸秒整数，不是毫秒。
    const stored = sqlite
      .prepare('SELECT created_at, expires_at FROM manual_payment_details WHERE order_id = ?')
      .get(order.id) as { created_at: number; expires_at: number }
    expect(stored.created_at).toBe(Math.floor(now.getTime() / 1000))
    expect(stored.expires_at).toBe(Math.floor(now.getTime() / 1000) + 15 * 60)
    sqlite.close()
  })

  it('同一账户已占用的尾数不会被再次分配', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    occupy(sqlite, { id: 'taken', fingerprint: 5 })
    forceFingerprintStart(4)
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).not.toBe(5)
    expect(order.payableAmount).toBe(BASE_AMOUNT + order.fingerprint)
    sqlite.close()
  })

  it('金额唯一性按收款账户约束：别的账户占用同额不阻塞', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    // 另一个收款账户已经用了同一个应付金额。
    occupy(sqlite, { id: 'other-account-order', fingerprint: 7, accountId: 'acct-other' })
    // 主账户只剩尾数 7 空着。
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 7) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBe(7)
    sqlite.close()
  })

  it('同一账户下两个活跃订单的应付金额不同', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    forceFingerprintStart(0)
    const [first, second] = await Promise.all([
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
      createOrder(db, { userId: 'u2', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ])
    expect(first.payableAmount).not.toBe(second.payableAmount)
    sqlite.close()
  })

  it('99 个活跃金额占满后抛 AMOUNT_POOL_EXHAUSTED', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      occupy(sqlite, { id: `full-${fingerprint}`, fingerprint })
    }
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'AMOUNT_POOL_EXHAUSTED' })
    sqlite.close()
  })

  it('随机起点之后按环形顺序扫描下一个空尾数', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    occupy(sqlite, { id: 'busy-1', fingerprint: 1 })
    occupy(sqlite, { id: 'busy-2', fingerprint: 2 })
    forceFingerprintStart(0)
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBe(3)
    sqlite.close()
  })
})

describe('核销订单惰性过期', () => {
  it('创建订单前把已到期的待支付订单标记为过期并释放金额', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 5) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    occupy(sqlite, { id: 'stale', fingerprint: 5, expiresAt: past })
    const order = await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      now,
    )
    expect(detailStatus(sqlite, 'stale')).toBe('expired')
    expect(order.fingerprint).toBe(5)
    sqlite.close()
  })

  it('已申报待核验的订单不会被惰性过期', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 3) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    occupy(sqlite, {
      id: 'submitted',
      fingerprint: 3,
      status: 'pending_verification',
      expiresAt: past,
    })
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }, now),
    ).rejects.toMatchObject({ code: 'AMOUNT_POOL_EXHAUSTED' })
    expect(detailStatus(sqlite, 'submitted')).toBe('pending_verification')
    sqlite.close()
  })

  it('expirePendingOrders 返回被标记为过期的订单数', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    occupy(sqlite, { id: 'stale-1', fingerprint: 1, expiresAt: past })
    occupy(sqlite, { id: 'stale-2', fingerprint: 2, expiresAt: past })
    occupy(sqlite, { id: 'alive', fingerprint: 3 })
    const expired = await expirePendingOrders(db, 'acct-main', now)
    expect(expired).toBe(2)
    expect(detailStatus(sqlite, 'stale-1')).toBe('expired')
    expect(detailStatus(sqlite, 'alive')).toBe('pending_payment')
    sqlite.close()
  })

  it('订单过期同步把 orders 标记为 expired', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(orderStatus(sqlite, order.id)).toBe('open')

    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const later = new Date(createdAt.getTime() + MANUAL_PAYMENT_ORDER_TTL_SECONDS * 1000)
    await getUserOrder(db, 'u1', order.id, later)

    expect(detailStatus(sqlite, order.id)).toBe('expired')
    expect(orderStatus(sqlite, order.id)).toBe('expired')
    sqlite.close()
  })
})

// --- 用户订单状态机与查询隔离 -------------------------------------------------

describe('用户订单状态机与查询隔离', () => {
  /** 固定基准时刻，避免测试依赖真实时钟。 */
  const T0 = new Date('2026-01-01T00:00:00.000Z')

  function plusSeconds(base: Date, seconds: number): Date {
    return new Date(base.getTime() + seconds * 1000)
  }

  /** 在指定时刻给指定用户下一单。 */
  async function createAt(
    db: DB,
    userId: string,
    now: Date = T0,
  ): Promise<Awaited<ReturnType<typeof createOrder>>> {
    return createOrder(db, { userId, productId: PRODUCT_ID, offerId: OFFER_ID }, now)
  }

  it('到期时刻等于当前时间即视为过期，不能申报且订单变为已过期', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    await expect(
      submitOrder(
        db,
        { userId: 'u1', orderId: order.id },
        plusSeconds(T0, MANUAL_PAYMENT_ORDER_TTL_SECONDS),
      ),
    ).rejects.toMatchObject({ code: 'ORDER_EXPIRED' })
    expect(detailStatus(sqlite, order.id)).toBe('expired')
    expect(orderStatus(sqlite, order.id)).toBe('expired')
    sqlite.close()
  })

  it('未到期的订单申报后进入待核验并记录申报时间', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    const submitted = await submitOrder(
      db,
      { userId: 'u1', orderId: order.id },
      plusSeconds(T0, 10),
    )
    expect(submitted.status).toBe('pending_verification')
    expect(submitted.submittedAt?.getTime()).toBe(plusSeconds(T0, 10).getTime())
    expect(detailStatus(sqlite, order.id)).toBe('pending_verification')
    // 进行中的订单在订单表里仍是 open。
    expect(orderStatus(sqlite, order.id)).toBe('open')
    sqlite.close()
  })

  it('申报后继续占用尾数，新订单拿不到同一个应付金额', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    await submitOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10))
    forceFingerprintStart(order.fingerprint)
    const next = await createAt(db, 'u2', plusSeconds(T0, 20))
    expect(next.payableAmount).not.toBe(order.payableAmount)
    sqlite.close()
  })

  it('重复申报返回状态非法', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    await submitOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10))
    await expect(
      submitOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 20)),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_STATE' })
    sqlite.close()
  })

  it('他人读取与提交统一表现为订单不存在', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    expect(await getUserOrder(db, 'u2', order.id, plusSeconds(T0, 10))).toBeNull()
    await expect(
      submitOrder(db, { userId: 'u2', orderId: order.id }, plusSeconds(T0, 10)),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    await expect(
      cancelOrder(db, { userId: 'u2', orderId: order.id }, plusSeconds(T0, 10)),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    expect(detailStatus(sqlite, order.id)).toBe('pending_payment')
    sqlite.close()
  })

  it('不存在的订单读取返回空、提交返回订单不存在', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    expect(await getUserOrder(db, 'u1', 'missing-order', T0)).toBeNull()
    await expect(
      submitOrder(db, { userId: 'u1', orderId: 'missing-order' }, T0),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    sqlite.close()
  })

  it('只有待支付订单可以取消', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    const canceled = await cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10))
    expect(canceled.status).toBe('canceled')
    expect(detailStatus(sqlite, order.id)).toBe('canceled')
    expect(orderStatus(sqlite, order.id)).toBe('canceled')
    sqlite.close()
  })

  it('待核验订单不能取消', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    await submitOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10))
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 20)),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_STATE' })
    expect(detailStatus(sqlite, order.id)).toBe('pending_verification')
    sqlite.close()
  })

  it('已取消的订单不能再次取消', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    await cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10))
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 20)),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_STATE' })
    sqlite.close()
  })

  it('详情已取消但订单状态同步失败时，重试把订单补成 canceled', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')

    breakOrderStatusSync(db, 'canceled')
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 10)),
    ).rejects.toThrow('订单状态同步失败')

    // 详情已取消，订单行还停在 open。
    expect(detailStatus(sqlite, order.id)).toBe('canceled')
    expect(orderStatus(sqlite, order.id)).toBe('open')

    // 重复取消仍抛错，但顺手补上订单状态。
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: order.id }, plusSeconds(T0, 20)),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_STATE' })
    expect(orderStatus(sqlite, order.id)).toBe('canceled')
    sqlite.close()
  })

  it('详情已过期但订单状态同步失败时，重试把订单补成 expired', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    occupy(sqlite, {
      id: 'ord-expired',
      fingerprint: 11,
      expiresAt: Math.floor(T0.getTime() / 1000),
    })

    breakOrderStatusSync(db, 'expired')
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: 'ord-expired' }, plusSeconds(T0, 30)),
    ).rejects.toThrow('订单状态同步失败')

    // 详情已过期，订单行还停在 open。
    expect(detailStatus(sqlite, 'ord-expired')).toBe('expired')
    expect(orderStatus(sqlite, 'ord-expired')).toBe('open')

    // 重试仍抛 ORDER_EXPIRED，但顺手补上订单状态。
    await expect(
      cancelOrder(db, { userId: 'u1', orderId: 'ord-expired' }, plusSeconds(T0, 40)),
    ).rejects.toMatchObject({ code: 'ORDER_EXPIRED' })
    expect(orderStatus(sqlite, 'ord-expired')).toBe('expired')
    sqlite.close()
  })

  it('辅助说明最多 500 字符，超出被拒绝', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    const accepted = await submitOrder(
      db,
      { userId: 'u1', orderId: order.id, payerNote: 'x'.repeat(500) },
      plusSeconds(T0, 10),
    )
    expect(accepted.payerNote).toHaveLength(500)

    const other = await createAt(db, 'u1', plusSeconds(T0, 20))
    await expect(
      submitOrder(
        db,
        { userId: 'u1', orderId: other.id, payerNote: 'x'.repeat(501) },
        plusSeconds(T0, 30),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAYER_NOTE' })
    expect(detailStatus(sqlite, other.id)).toBe('pending_payment')
    sqlite.close()
  })

  it('读取自己的订单时惰性过期待支付订单，不动待核验订单', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const pending = await createAt(db, 'u1')
    const submitted = await createAt(db, 'u1', plusSeconds(T0, 1))
    await submitOrder(db, { userId: 'u1', orderId: submitted.id }, plusSeconds(T0, 2))
    const later = plusSeconds(T0, MANUAL_PAYMENT_ORDER_TTL_SECONDS)
    const read = await getUserOrder(db, 'u1', pending.id, later)
    expect(read?.status).toBe('expired')
    expect(detailStatus(sqlite, pending.id)).toBe('expired')
    expect(detailStatus(sqlite, submitted.id)).toBe('pending_verification')
    sqlite.close()
  })

  it('过期订单释放尾数，新订单可以复用同一个应付金额', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    const order = await createAt(db, 'u1')
    const later = plusSeconds(T0, MANUAL_PAYMENT_ORDER_TTL_SECONDS)
    await getUserOrder(db, 'u1', order.id, later)
    expect(detailStatus(sqlite, order.id)).toBe('expired')
    forceFingerprintStart(order.fingerprint - 1)
    const next = await createAt(db, 'u2', later)
    expect(next.fingerprint).toBe(order.fingerprint)
    expect(next.payableAmount).toBe(order.payableAmount)
    sqlite.close()
  })

  it('列表只返回自己的订单，并在返回前惰性过期自己的待支付订单', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createAt(db, 'u1')
    await createAt(db, 'u1', plusSeconds(T0, 1))
    await createAt(db, 'u2', plusSeconds(T0, 2))
    // 到期时刻恰好等于当前时间的订单同样算过期。
    const later = plusSeconds(T0, 901)
    const page = await listUserOrders(db, { userId: 'u1', limit: 10, offset: 0 }, later)
    expect(page.total).toBe(2)
    expect(page.rows.map((row) => row.userId)).toEqual(['u1', 'u1'])
    expect(page.rows.every((row) => row.status === 'expired')).toBe(true)
    // 别人的待支付订单不受影响。
    const other = await listUserOrders(db, { userId: 'u2', limit: 10, offset: 0 }, later)
    expect(other.total).toBe(1)
    expect(other.rows[0]?.status).toBe('pending_payment')
    sqlite.close()
  })

  it('列表支持分页', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createAt(db, 'u1')
    await createAt(db, 'u1', plusSeconds(T0, 1))
    await createAt(db, 'u1', plusSeconds(T0, 2))
    const page = await listUserOrders(db, { userId: 'u1', limit: 2, offset: 0 }, plusSeconds(T0, 3))
    expect(page.total).toBe(3)
    expect(page.rows).toHaveLength(2)
    const next = await listUserOrders(db, { userId: 'u1', limit: 2, offset: 2 }, plusSeconds(T0, 3))
    expect(next.rows).toHaveLength(1)
    sqlite.close()
  })

  it('列表只统计核销订单，不混入同一用户的在线结账订单', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createAt(db, 'u1')
    // 同一个用户的在线结账订单：没有核销详情，也不属于核销 provider。
    const second = Math.floor(plusSeconds(T0, 5).getTime() / 1000)
    sqlite
      .prepare(
        `INSERT INTO orders(id,order_no,user_id,provider,mode,product_id,offer_id,status,created_at,updated_at)
         VALUES ('online-1','ord_online_1','u1','stripe','subscription','pro','monthly','created',?,?)`,
      )
      .run(second, second)

    const page = await listUserOrders(
      db,
      { userId: 'u1', limit: 10, offset: 0 },
      plusSeconds(T0, 10),
    )
    expect(page.total).toBe(1)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).not.toBe('online-1')
    sqlite.close()
  })
})

describe('管理员订单列表', () => {
  const T0 = new Date('2026-01-01T00:00:00.000Z')

  function plusSeconds(base: Date, seconds: number): Date {
    return new Date(base.getTime() + seconds * 1000)
  }

  it('管理员列表按订单状态筛选并带买家邮箱', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }, T0)
    await createOrder(
      db,
      { userId: 'u2', productId: PRODUCT_ID, offerId: OFFER_ID },
      plusSeconds(T0, 1),
    )
    // 把其中一单推进到待核验。
    sqlite
      .prepare(
        "UPDATE manual_payment_details SET status = 'pending_verification' WHERE user_id = 'u2'",
      )
      .run()

    const page = await listAllOrders(db, { status: 'pending_verification', limit: 20, offset: 0 })
    expect(page.total).toBe(1)
    expect(page.rows[0]?.userId).toBe('u2')
    // 人工对账要能认出是谁付的款。
    expect(page.rows[0]?.email).toBe('u2@example.com')
    // 管理员列表同样带出对外订单号。
    expect(page.rows[0]?.orderNo).toMatch(/^ord_\d{14}_[A-Z0-9]{8}$/)
    sqlite.close()
  })

  it("'all' 不按状态过滤", async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }, T0)
    await createOrder(
      db,
      { userId: 'u2', productId: PRODUCT_ID, offerId: OFFER_ID },
      plusSeconds(T0, 1),
    )
    sqlite
      .prepare(
        "UPDATE manual_payment_details SET status = 'pending_verification' WHERE user_id = 'u2'",
      )
      .run()

    const page = await listAllOrders(db, { status: 'all', limit: 20, offset: 0 })
    expect(page.total).toBe(2)
    sqlite.close()
  })

  it('支持分页', async () => {
    const { db, sqlite } = manualPaymentDatabase()
    await createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }, T0)
    await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      plusSeconds(T0, 1),
    )
    await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      plusSeconds(T0, 2),
    )

    const page = await listAllOrders(db, { status: 'all', limit: 2, offset: 0 })
    expect(page.total).toBe(3)
    expect(page.rows).toHaveLength(2)
    const next = await listAllOrders(db, { status: 'all', limit: 2, offset: 2 })
    expect(next.rows).toHaveLength(1)
    sqlite.close()
  })
})
