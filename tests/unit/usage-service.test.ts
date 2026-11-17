import { describe, expect, it } from 'vitest'
import { grantCredits } from '../../src/modules/credits/service'
import { QuotaExceededError } from '../../src/modules/entitlements/service'
import {
  getUsageSummary,
  listUsage,
  meterUsage,
  recordUsage,
} from '../../src/modules/usage/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 用量：流水与计量。
 *
 * 计量把三件事串起来：扣额度 → 扣积分 → 记流水。顺序不能反——
 * 额度不足时不该扣积分，积分不足时额度要退回去。
 */

function seedCatalog(sqlite: ReturnType<typeof createTestDatabase>['sqlite']): void {
  sqlite.exec(
    `INSERT INTO entitlements(key,name,type,default_limit,period,description,sort_order,created_at,updated_at)
     VALUES ('api_call','API 调用','quota',100,'none',NULL,1,1,1)`,
  )
}

describe('用量流水', () => {
  it('记一条用量', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    const record = await recordUsage(db, {
      userId: 'u1',
      metric: 'api_call',
      quantity: 3,
      credits: 5,
    })

    expect(record.quantity).toBe(3)
    expect(record.credits).toBe(5)
    expect(record.unit).toBe('count')
    expect(await listUsage(db, 'u1')).toHaveLength(1)
  })

  it('同一幂等键只记一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    await recordUsage(db, {
      userId: 'u1',
      metric: 'api_call',
      quantity: 3,
      idempotencyKey: 'req_1',
    })
    await recordUsage(db, {
      userId: 'u1',
      metric: 'api_call',
      quantity: 3,
      idempotencyKey: 'req_1',
    })

    expect(await listUsage(db, 'u1')).toHaveLength(1)
  })

  it('附加信息原样存回', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    const record = await recordUsage(db, {
      userId: 'u1',
      metric: 'api_call',
      quantity: 1,
      metadata: { model: 'test-model' },
    })

    expect(record.metadata).toEqual({ model: 'test-model' })
  })

  it('按计量项汇总', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    await recordUsage(db, { userId: 'u1', metric: 'api_call', quantity: 2, credits: 4 })
    await recordUsage(db, { userId: 'u1', metric: 'api_call', quantity: 3, credits: 6 })
    await recordUsage(db, { userId: 'u1', metric: 'image', quantity: 1, credits: 10 })

    const summary = await getUsageSummary(db, 'u1')
    expect(summary).toEqual([
      { metric: 'api_call', quantity: 5, credits: 10, records: 2 },
      { metric: 'image', quantity: 1, credits: 10, records: 1 },
    ])
  })
})

describe('计量', () => {
  it('扣额度、扣积分、记流水一次做完', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    const result = await meterUsage(db, {
      userId: 'u1',
      metric: 'api_call',
      quantity: 2,
      credits: 7,
      entitlementKey: 'api_call',
    })

    expect(result.quotaUsed).toBe(2)
    expect(result.creditsUsed).toBe(7)
    expect(result.usage.quantity).toBe(2)

    const entitlements = sqlite
      .prepare('SELECT used FROM user_entitlements WHERE entitlement_key = ?')
      .get('api_call') as { used: number }
    expect(entitlements.used).toBe(2)

    const balance = sqlite.prepare('SELECT balance FROM credit_balances').get() as {
      balance: number
    }
    expect(balance.balance).toBe(93)
  })

  it('额度不足时什么都不发生', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    await expect(
      meterUsage(db, {
        userId: 'u1',
        metric: 'api_call',
        quantity: 200,
        credits: 1,
        entitlementKey: 'api_call',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError)

    // 积分没扣，流水也没有。
    const balance = sqlite.prepare('SELECT balance FROM credit_balances').get() as {
      balance: number
    }
    expect(balance.balance).toBe(100)
    expect(await listUsage(db, 'u1')).toHaveLength(0)
  })

  it('积分不足时额度退回去', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    await expect(
      meterUsage(db, {
        userId: 'u1',
        metric: 'api_call',
        quantity: 5,
        credits: 50,
        entitlementKey: 'api_call',
      }),
    ).rejects.toThrow()

    const entitlements = sqlite
      .prepare('SELECT used FROM user_entitlements WHERE entitlement_key = ?')
      .get('api_call') as { used: number }
    expect(entitlements.used).toBe(0)
    expect(await listUsage(db, 'u1')).toHaveLength(0)
  })
})
