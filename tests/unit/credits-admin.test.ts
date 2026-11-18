import { describe, expect, it } from 'vitest'
import {
  queryAdminCreditBalances,
  queryAdminCreditTransactions,
} from '../../src/modules/credits/admin'
import { grantCredits } from '../../src/modules/credits/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 管理台积分视图。
 *
 * 余额列表要能按邮箱搜到人；流水列表按用户查，两条都带邮箱，
 * 免得管理员拿到一串 userId 还要自己去对。
 */

describe('管理台积分余额', () => {
  it('列出余额并带上邮箱', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedUser(sqlite, 'u2')
    await grantCredits(db, { userId: 'u1', amount: 100, source: 'purchase', idempotencyKey: 'g1' })
    await grantCredits(db, { userId: 'u2', amount: 40, source: 'purchase', idempotencyKey: 'g2' })

    const result = await queryAdminCreditBalances(db, {})
    expect(result.total).toBe(2)
    const u1 = result.balances.find((row) => row.userId === 'u1')
    expect(u1?.email).toBe('u1@example.com')
    expect(u1?.balance).toBe(100)
  })

  it('按邮箱关键词搜索', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedUser(sqlite, 'u2')
    await grantCredits(db, { userId: 'u1', amount: 100, source: 'purchase', idempotencyKey: 'g1' })
    await grantCredits(db, { userId: 'u2', amount: 40, source: 'purchase', idempotencyKey: 'g2' })

    const result = await queryAdminCreditBalances(db, { search: 'u2@' })
    expect(result.total).toBe(1)
    expect(result.balances[0]?.userId).toBe('u2')
  })

  it('没发过积分的用户也在列表里，余额为 0', async () => {
    // 否则管理员想给新用户发积分时，列表里根本没有这个人，无从下手。
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    const result = await queryAdminCreditBalances(db, {})
    expect(result.total).toBe(1)
    expect(result.balances[0]?.userId).toBe('u1')
    expect(result.balances[0]?.balance).toBe(0)
    expect(result.balances[0]?.totalGranted).toBe(0)
  })
})

describe('管理台积分流水', () => {
  it('按用户列出流水，带邮箱', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, { userId: 'u1', amount: 100, source: 'admin', idempotencyKey: 'g1' })

    const result = await queryAdminCreditTransactions(db, { userId: 'u1' })
    expect(result.total).toBe(1)
    expect(result.transactions[0]?.email).toBe('u1@example.com')
    expect(result.transactions[0]?.type).toBe('grant')
    expect(result.transactions[0]?.amount).toBe(100)
  })

  it('只看得到该用户的流水', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    seedUser(sqlite, 'u2')
    await grantCredits(db, { userId: 'u1', amount: 100, source: 'admin', idempotencyKey: 'g1' })
    await grantCredits(db, { userId: 'u2', amount: 50, source: 'admin', idempotencyKey: 'g2' })

    const result = await queryAdminCreditTransactions(db, { userId: 'u1' })
    expect(result.total).toBe(1)
    expect(result.transactions[0]?.userId).toBe('u1')
  })
})
