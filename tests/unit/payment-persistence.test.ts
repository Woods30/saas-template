import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it, vi } from 'vitest'

const notifications = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(true) }))
vi.mock('@/notification', () => ({ notify: notifications.notify }))

import { beginCheckout } from '@/payment/checkout'
import { applyPaymentEvent } from '@/payment/events'
import type { PaymentEvent, PaymentProvider } from '@/payment/types'

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`src/db/migrations/${name}`, 'utf8'))
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1)",
  )
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) }
  })
  return { sqlite, db: db as unknown as Parameters<typeof applyPaymentEvent>[0] }
}
const subscription: NonNullable<PaymentEvent['subscription']> = {
  id: 'sub_1',
  userId: 'u1',
  customerId: 'cus_1',
  priceId: 'p1',
  reference: 'pro_monthly',
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  intervalCount: 1,
  currentPeriodStart: 100,
  currentPeriodEnd: 200,
  cancelAtPeriodEnd: false,
  status: 'active',
}

describe('支付持久化', () => {
  it('旧订阅事件不会清除新 Checkout，改选项会明确拒绝', async () => {
    const { db, sqlite } = database()
    const provider = {
      getProviderName: () => 'stripe',
      createCheckoutSession: async () => ({
        url: 'https://checkout.stripe.com/one',
        sessionId: 'cs_new',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as unknown as PaymentProvider
    const input = {
      userId: 'u1',
      customerEmail: 'u1@example.com',
      priceId: 'p1',
      productId: 'pro',
      offerId: 'monthly',
      mode: 'subscription' as const,
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/no',
    }
    await beginCheckout(db, provider, input)
    await applyPaymentEvent(db, {
      id: 'old_deleted',
      provider: 'stripe',
      type: 'deleted',
      created: 100,
      subscription: { ...subscription, status: 'canceled' },
    })
    expect(sqlite.prepare('SELECT count(*) as n FROM checkout_reservations').get()?.n).toBe(1)
    await expect(
      beginCheckout(db, provider, { ...input, offerId: 'yearly', priceId: 'p2' }),
    ).rejects.toThrow('CHECKOUT_PENDING')
    sqlite.close()
  })
  it('检查后订阅同步完成时不再创建第二个 Checkout', async () => {
    const { db, sqlite } = database()
    const provider = {
      getProviderName: () => 'stripe',
      createCheckoutSession: async () => {
        throw new Error('不得创建第二个 Checkout')
      },
    } as unknown as PaymentProvider
    const original = db.select.bind(db)
    let first = true
    db.select = ((...args: Parameters<typeof db.select>) => {
      const builder = original(...args)
      const from = builder.from.bind(builder)
      builder.from = ((...tables: Parameters<typeof builder.from>) => {
        const query = from(...tables)
        const limit = query.limit.bind(query)
        query.limit = ((n: number) => {
          const result = limit(n)
          if (!first) return result
          first = false
          return Promise.resolve(result).then((rows) => {
            sqlite.exec(
              "INSERT INTO subscriptions(id,user_id,subscription_id,status) VALUES ('raced','u1','sub_raced','active')",
            )
            return rows
          })
        }) as typeof query.limit
        return query
      }) as typeof builder.from
      return builder
    }) as typeof db.select
    expect(
      await beginCheckout(db, provider, {
        userId: 'u1',
        customerEmail: 'u1@example.com',
        priceId: 'p1',
        productId: 'pro',
        offerId: 'monthly',
        mode: 'subscription',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/no',
      }),
    ).toBeNull()
    sqlite.close()
  })
  it('迁移落实外部标识非空与退款复合索引', () => {
    const { sqlite } = database()
    for (const [table, column] of [
      ['subscriptions', 'subscription_id'],
      ['payments', 'external_id'],
    ]) {
      expect(
        sqlite
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .find((row) => row.name === column)?.notnull,
      ).toBe(1)
    }
    expect(
      sqlite
        .prepare('PRAGMA index_info(payments_charge_idx)')
        .all()
        .map((row) => row.name),
    ).toEqual(['provider', 'charge_id'])
    sqlite.close()
  })
  it('重复事件只落一笔交易，终止订阅不被旧事件恢复', async () => {
    const { db, sqlite } = database()
    const event: PaymentEvent = {
      id: 'evt1',
      provider: 'stripe',
      type: 'paid',
      created: 100,
      subscription,
      payment: {
        id: 'inv1',
        invoiceId: 'inv1',
        chargeId: 'pi1',
        customerId: 'cus_1',
        userId: 'u1',
        productId: null,
        offerId: null,
        subscriptionId: 'sub_1',
        type: 'subscription',
        amount: 1000,
        currency: 'usd',
        status: 'paid',
      },
    }
    notifications.notify.mockClear()
    await applyPaymentEvent(db, event)
    await applyPaymentEvent(db, event)
    expect(notifications.notify).toHaveBeenCalledTimes(1)
    await applyPaymentEvent(db, {
      id: 'evt2',
      provider: 'stripe',
      type: 'deleted',
      created: 110,
      subscription: { ...subscription, status: 'canceled' },
    })
    await applyPaymentEvent(db, {
      id: 'evt3',
      provider: 'stripe',
      type: 'updated',
      created: 90,
      subscription,
    })
    expect(sqlite.prepare('SELECT count(*) as n FROM payments').get()?.n).toBe(1)
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('canceled')
    expect(sqlite.prepare('SELECT product_id FROM subscriptions').get()?.product_id).toBe('pro')
    sqlite.close()
  })
  it('同秒并发旧快照不能覆盖先落库的新价格', async () => {
    const { db, sqlite } = database()
    let release!: () => void
    let fetched!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      fetched = resolve
    })
    let reads = 0
    const yearly = { ...subscription, priceId: 'p_year', reference: 'pro_yearly', interval: 'year' }
    const first = applyPaymentEvent(
      db,
      {
        id: 'same_a',
        provider: 'stripe',
        type: 'updated',
        created: 100,
        subscriptionId: 'sub_1',
        subscription,
      },
      async () => {
        if (reads++ === 0) {
          fetched()
          await pending
          return subscription
        }
        return yearly
      },
    )
    await started
    await applyPaymentEvent(
      db,
      {
        id: 'same_b',
        provider: 'stripe',
        type: 'updated',
        created: 100,
        subscriptionId: 'sub_1',
        subscription: yearly,
      },
      async () => yearly,
    )
    release()
    await first
    expect(sqlite.prepare('SELECT price_id FROM subscriptions').get()?.price_id).toBe('p_year')
    sqlite.close()
  })
  it('部分退款幂等保留原付款金额', async () => {
    const { db, sqlite } = database()
    await applyPaymentEvent(db, {
      id: 'paid',
      provider: 'stripe',
      type: 'payment',
      created: 100,
      payment: {
        id: 'pi1',
        invoiceId: null,
        chargeId: 'pi1',
        customerId: 'cus1',
        userId: 'u1',
        productId: 'lifetime',
        offerId: 'once',
        subscriptionId: null,
        type: 'one_time',
        amount: 1000,
        currency: 'usd',
        status: 'paid',
      },
    })
    await applyPaymentEvent(db, {
      id: 'refund',
      provider: 'stripe',
      type: 'refund',
      created: 110,
      refund: { chargeId: 'pi1', amount: 300 },
    })
    expect(
      sqlite.prepare('SELECT status, amount, refunded_amount FROM payments').get(),
    ).toMatchObject({ status: 'partially_refunded', amount: 1000, refunded_amount: 300 })
    sqlite.close()
  })
  it('第二笔发票付款的退款只影响对应金额', async () => {
    const { db, sqlite } = database()
    const base = {
      invoiceId: 'inv_multi',
      customerId: 'cus1',
      userId: 'u1',
      productId: 'pro',
      offerId: 'monthly',
      subscriptionId: null,
      type: 'subscription' as const,
      currency: 'usd',
      status: 'paid' as const,
    }
    await applyPaymentEvent(db, {
      id: 'multi',
      provider: 'stripe',
      type: 'paid',
      created: 100,
      payments: [
        { ...base, id: 'ip_a', chargeId: 'pi_a', amount: 600 },
        { ...base, id: 'ip_b', chargeId: 'pi_b', amount: 400 },
      ],
    })
    await applyPaymentEvent(db, {
      id: 'refund_b',
      provider: 'stripe',
      type: 'refund',
      created: 110,
      refund: { chargeId: 'pi_b', amount: 100 },
    })
    expect(
      sqlite
        .prepare('SELECT amount,refunded_amount,status FROM payments ORDER BY external_id')
        .all(),
    ).toEqual([
      { amount: 600, refunded_amount: 0, status: 'paid' },
      { amount: 400, refunded_amount: 100, status: 'partially_refunded' },
    ])
    sqlite.close()
  })
  it('终止订阅可重新购买，一次性购买不占用订阅预留', async () => {
    const { db, sqlite } = database()
    await applyPaymentEvent(db, {
      id: 'ended',
      provider: 'stripe',
      type: 'deleted',
      created: 100,
      subscription: { ...subscription, status: 'canceled' },
    })
    const keys: string[] = []
    const provider = {
      getProviderName: () => 'stripe',
      createCheckoutSession: async (p: { idempotencyKey: string }) => {
        keys.push(p.idempotencyKey)
        return {
          url: 'https://checkout.stripe.com/session',
          sessionId: `cs_${keys.length}`,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }
      },
    } as unknown as PaymentProvider
    const input = {
      userId: 'u1',
      customerEmail: 'u1@example.com',
      priceId: 'p1',
      productId: 'pro',
      offerId: 'monthly',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/no',
    }
    expect(await beginCheckout(db, provider, { ...input, mode: 'subscription' })).not.toBeNull()
    await beginCheckout(db, provider, { ...input, mode: 'payment' })
    await beginCheckout(db, provider, { ...input, mode: 'payment' })
    expect(new Set(keys).size).toBe(3)
    expect(sqlite.prepare('SELECT count(*) as n FROM checkout_reservations').get()?.n).toBe(1)
    sqlite.close()
  })
  it('并发订阅结账使用同一个幂等键，已完成订阅阻止再次购买', async () => {
    const { db, sqlite } = database()
    const keys: string[] = []
    const provider = {
      getProviderName: () => 'stripe',
      createCheckoutSession: async (p: { idempotencyKey: string }) => {
        keys.push(p.idempotencyKey)
        return {
          url: 'https://checkout.stripe.com/session',
          sessionId: 'cs1',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }
      },
    } as unknown as PaymentProvider
    const input = {
      userId: 'u1',
      customerEmail: 'u1@example.com',
      priceId: 'p1',
      productId: 'pro',
      offerId: 'monthly',
      mode: 'subscription' as const,
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/no',
    }
    const results = await Promise.all([
      beginCheckout(db, provider, input),
      beginCheckout(db, provider, input),
    ])
    expect(results.every((r) => r?.sessionId === 'cs1')).toBe(true)
    expect(new Set(keys).size).toBe(1)
    await applyPaymentEvent(db, {
      id: 'active',
      provider: 'stripe',
      type: 'subscription',
      created: 100,
      subscription,
    })
    expect(await beginCheckout(db, provider, input)).toBeNull()
    sqlite.close()
  })
})
