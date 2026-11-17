import { describe, expect, it } from 'vitest'
import {
  checkEntitlement,
  consumeQuota,
  EntitlementNotFoundError,
  grantPlan,
  listEntitlements,
  listPlans,
  QuotaExceededError,
  resolveEntitlements,
  restoreQuota,
} from '../../src/modules/entitlements/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 权益：目录 → 套餐 → 用户覆盖三层解析，以及额度的原子消费。
 *
 * 额度消费必须写成单条条件更新（D1 没有交互式事务），所以这里验的是
 * 「并发下不超限」与「周期到期自动重置」。
 */

function seedCatalog(sqlite: ReturnType<typeof createTestDatabase>['sqlite']): void {
  sqlite.exec(
    `INSERT INTO entitlements(key,name,type,default_limit,period,description,sort_order,created_at,updated_at)
     VALUES ('api_call','API 调用','quota',100,'none',NULL,1,1,1),
            ('image','图片生成','quota',10,'month',NULL,2,1,1),
            ('hd','高清导出','boolean',NULL,'none',NULL,3,1,1)`,
  )
}

describe('权益目录与套餐', () => {
  it('目录与套餐按顺序列出', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    sqlite.exec(
      `INSERT INTO plans(key,name,description,product_id,offer_id,active,sort_order,created_at,updated_at)
       VALUES ('pro','专业版',NULL,'pro','monthly',1,1,1,1)`,
    )

    expect((await listEntitlements(db)).map((item) => item.key)).toEqual([
      'api_call',
      'image',
      'hd',
    ])
    expect((await listPlans(db)).map((plan) => plan.key)).toEqual(['pro'])
  })

  it('解析时把生效额度物化到用户行上', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    const resolved = await resolveEntitlements(db, 'u1')
    const apiCall = resolved.find((item) => item.key === 'api_call')
    expect(apiCall?.limit).toBe(100)
    expect(apiCall?.used).toBe(0)

    const rows = sqlite.prepare('SELECT limit_value FROM user_entitlements').all()
    expect(rows).toHaveLength(2) // 两个 quota 型权益
  })

  it('未知权益抛错', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    await expect(checkEntitlement(db, 'u1', 'nope')).rejects.toBeInstanceOf(
      EntitlementNotFoundError,
    )
  })
})

describe('额度消费', () => {
  it('扣额度后已用量增加', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    await consumeQuota(db, 'u1', 'api_call', 30)
    const after = await checkEntitlement(db, 'u1', 'api_call')
    expect(after.used).toBe(30)
    expect(after.remaining).toBe(70)
  })

  it('额度用尽后抛错，且不超用', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    await consumeQuota(db, 'u1', 'api_call', 100)
    await expect(consumeQuota(db, 'u1', 'api_call', 1)).rejects.toBeInstanceOf(QuotaExceededError)

    const after = await checkEntitlement(db, 'u1', 'api_call')
    expect(after.used).toBe(100)
  })

  it('并发消费不超限', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => consumeQuota(db, 'u1', 'api_call', 30)),
    )
    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled')
    expect(succeeded).toHaveLength(3)

    const after = await checkEntitlement(db, 'u1', 'api_call')
    expect(after.used).toBe(90)
  })

  it('退回额度后用量减少', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')

    await consumeQuota(db, 'u1', 'api_call', 30)
    await restoreQuota(db, 'u1', 'api_call', 30)

    const after = await checkEntitlement(db, 'u1', 'api_call')
    expect(after.used).toBe(0)
  })

  it('周期到期后已用量归零、额度恢复', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    const base = new Date('2026-01-01T00:00:00Z')

    await consumeQuota(db, 'u1', 'image', 5, base)
    expect((await checkEntitlement(db, 'u1', 'image', base)).used).toBe(5)

    // 一个月后：额度按周期重置。
    const later = new Date(base.getTime() + 40 * 24 * 60 * 60 * 1000)
    const after = await checkEntitlement(db, 'u1', 'image', later)
    expect(after.used).toBe(0)
    expect(after.limit).toBe(10)
  })
})

describe('套餐与用户覆盖', () => {
  it('开通套餐给出套餐里的额度', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    sqlite.exec(
      `INSERT INTO plans(key,name,description,product_id,offer_id,active,sort_order,created_at,updated_at)
       VALUES ('pro','专业版',NULL,NULL,NULL,1,1,1,1)`,
    )
    sqlite.exec(
      `INSERT INTO plan_entitlements(id,plan_key,entitlement_key,limit_value,enabled)
       VALUES ('pe1','pro','api_call',500,1)`,
    )

    await grantPlan(db, 'u1', 'pro')
    const resolved = await resolveEntitlements(db, 'u1')
    expect(resolved.find((item) => item.key === 'api_call')?.limit).toBe(500)
  })

  it('订阅生效后按套餐给额度', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    sqlite.exec(
      `INSERT INTO plans(key,name,description,product_id,offer_id,active,sort_order,created_at,updated_at)
       VALUES ('pro','专业版',NULL,'pro','monthly',1,1,1,1)`,
    )
    sqlite.exec(
      `INSERT INTO plan_entitlements(id,plan_key,entitlement_key,limit_value,enabled)
       VALUES ('pe1','pro','api_call',500,1)`,
    )
    sqlite.exec(
      `INSERT INTO subscriptions(id,user_id,provider,subscription_id,status,product_id,offer_id,created_at,updated_at)
       VALUES ('s1','u1','stripe','sub_1','active','pro','monthly',1,1)`,
    )

    const resolved = await resolveEntitlements(db, 'u1')
    expect(resolved.find((item) => item.key === 'api_call')?.limit).toBe(500)
  })

  it('用户覆盖优先于套餐', async () => {
    const { sqlite, db } = createTestDatabase()
    seedCatalog(sqlite)
    seedUser(sqlite, 'u1')
    sqlite.exec(
      `INSERT INTO plans(key,name,description,product_id,offer_id,active,sort_order,created_at,updated_at)
       VALUES ('pro','专业版',NULL,NULL,NULL,1,1,1,1)`,
    )
    sqlite.exec(
      `INSERT INTO plan_entitlements(id,plan_key,entitlement_key,limit_value,enabled)
       VALUES ('pe1','pro','api_call',500,1)`,
    )
    sqlite.exec(
      `INSERT INTO user_entitlements(id,user_id,entitlement_key,limit_value,used,created_at,updated_at)
       VALUES ('ue1','u1','api_call',7,0,1,1)`,
    )

    const resolved = await resolveEntitlements(db, 'u1')
    expect(resolved.find((item) => item.key === 'api_call')?.limit).toBe(7)
  })
})
