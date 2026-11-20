import { describe, expect, it } from 'vitest'
import {
  clawbackCredits,
  consumeCredits,
  expireCredits,
  getBalance,
  getBalanceSummary,
  grantCredits,
  InsufficientCreditsError,
  listTransactions,
  refundCredits,
} from '../../src/modules/credits/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 积分账本：并发、幂等、退款。
 *
 * 这三条是账本的生死线：并发下不能超发，重复请求不能重复扣，退款必须能把余额
 * 还原。账本跑在 D1 上时**没有交互式事务**，所以这三条全靠单条条件更新保证——
 * 用例因此跑在真 SQLite 上，而不是假 db。
 */

describe('积分账本', () => {
  it('发放后余额增加并留下流水', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    const result = await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      reference: 'order_1',
      idempotencyKey: 'grant_1',
    })

    expect(result.replayed).toBe(false)
    expect(result.transaction.balanceAfter).toBe(100)
    expect(await getBalance(db, 'u1')).toBe(100)

    const summary = await getBalanceSummary(db, 'u1')
    expect(summary.totalGranted).toBe(100)
    expect(summary.totalConsumed).toBe(0)
  })

  it('同一幂等键发放两次只生效一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'bonus',
      idempotencyKey: 'grant_1',
    })
    const second = await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'bonus',
      idempotencyKey: 'grant_1',
    })

    expect(second.replayed).toBe(true)
    expect(await getBalance(db, 'u1')).toBe(100)
    expect(await listTransactions(db, 'u1')).toHaveLength(1)
  })

  it('消费后余额减少，流水是有符号的', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    const result = await consumeCredits(db, {
      userId: 'u1',
      amount: 30,
      idempotencyKey: 'consume_1',
    })

    expect(result.transaction.amount).toBe(-30)
    expect(result.transaction.balanceAfter).toBe(70)
    expect(await getBalance(db, 'u1')).toBe(70)
  })

  it('同一幂等键消费两次只扣一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    await consumeCredits(db, { userId: 'u1', amount: 30, idempotencyKey: 'consume_1' })
    const second = await consumeCredits(db, {
      userId: 'u1',
      amount: 30,
      idempotencyKey: 'consume_1',
    })

    expect(second.replayed).toBe(true)
    expect(await getBalance(db, 'u1')).toBe(70)
    expect(await listTransactions(db, 'u1')).toHaveLength(2)
  })

  it('余额不足时报错，且不留下流水', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 10,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    await expect(
      consumeCredits(db, { userId: 'u1', amount: 30, idempotencyKey: 'consume_1' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError)

    expect(await getBalance(db, 'u1')).toBe(10)
    expect(await listTransactions(db, 'u1')).toHaveLength(1)
  })

  it('并发消费不会超发', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        consumeCredits(db, { userId: 'u1', amount: 30, idempotencyKey: `consume_${index}` }),
      ),
    )

    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const failed = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(succeeded).toHaveLength(3)
    expect(failed).toHaveLength(7)
    expect(await getBalance(db, 'u1')).toBe(10)
  })

  it('退款把余额还回去，并开一个新批次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })
    await consumeCredits(db, { userId: 'u1', amount: 30, idempotencyKey: 'consume_1' })

    const refund = await refundCredits(db, {
      userId: 'u1',
      amount: 30,
      reference: 'order_1',
      idempotencyKey: 'refund_1',
    })

    expect(refund.transaction.type).toBe('refund')
    expect(await getBalance(db, 'u1')).toBe(100)

    // 退回来的积分能再次消费：说明它进了可用的批次，而不是只改了余额数字。
    const after = await consumeCredits(db, {
      userId: 'u1',
      amount: 100,
      idempotencyKey: 'consume_2',
    })
    expect(after.transaction.balanceAfter).toBe(0)
  })

  it('同一幂等键退款两次只退一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_1',
    })
    await consumeCredits(db, { userId: 'u1', amount: 30, idempotencyKey: 'consume_1' })

    await refundCredits(db, { userId: 'u1', amount: 30, idempotencyKey: 'refund_1' })
    const second = await refundCredits(db, {
      userId: 'u1',
      amount: 30,
      idempotencyKey: 'refund_1',
    })

    expect(second.replayed).toBe(true)
    expect(await getBalance(db, 'u1')).toBe(100)
  })

  it('过期的批次被作废，余额跟着扣', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const past = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-02-01T00:00:00Z')

    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      expiresAt: past,
      idempotencyKey: 'grant_1',
      now: past,
    })

    const expired = await expireCredits(db, 'u1', now)
    expect(expired).toHaveLength(1)
    expect(expired[0]?.transaction.type).toBe('expire')
    expect(await getBalance(db, 'u1')).toBe(0)
  })

  it('过期批次不能再被消费', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const past = new Date('2026-01-01T00:00:00Z')

    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      expiresAt: past,
      idempotencyKey: 'grant_1',
      now: past,
    })

    await expect(
      consumeCredits(db, {
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'consume_1',
        now: new Date('2026-02-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError)
  })

  it('消费先扣快过期的批次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    const base = new Date('2026-01-01T00:00:00Z')

    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      idempotencyKey: 'grant_never',
      now: base,
    })
    await grantCredits(db, {
      userId: 'u1',
      amount: 50,
      source: 'bonus',
      expiresAt: new Date(base.getTime() + 60_000),
      idempotencyKey: 'grant_soon',
      now: base,
    })

    await consumeCredits(db, {
      userId: 'u1',
      amount: 30,
      idempotencyKey: 'consume_1',
      now: base,
    })

    // 快过期的 50 被扣掉 30，剩下的 20 还在那个批次里；永不过期的 100 没动。
    const grants = sqlite
      .prepare('SELECT remaining FROM credit_grants ORDER BY created_at')
      .all() as Array<{ remaining: number }>
    expect(grants.map((row) => row.remaining)).toEqual([100, 20])
  })

  it('非正整数的额度直接报错', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')

    await expect(
      grantCredits(db, { userId: 'u1', amount: 0, source: 'bonus', idempotencyKey: 'g' }),
    ).rejects.toThrow()
    await expect(
      consumeCredits(db, { userId: 'u1', amount: 1.5, idempotencyKey: 'c' }),
    ).rejects.toThrow()
  })
})

describe('退款反扣', () => {
  it('只扣该订单批次的积分，其余批次不动', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      reference: 'stripe:pi_1',
      idempotencyKey: 'grant_order',
    })
    await grantCredits(db, {
      userId: 'u1',
      amount: 50,
      source: 'bonus',
      idempotencyKey: 'grant_bonus',
    })

    const clawback = await clawbackCredits(db, {
      userId: 'u1',
      reference: 'stripe:pi_1',
      amount: 60,
      reason: 'refund',
      idempotencyKey: 'refund-clawback:stripe:pi_1',
    })

    expect(clawback.expected).toBe(60)
    expect(clawback.deducted).toBe(60)
    expect(clawback.shortfall).toBe(0)
    expect(clawback.transaction.type).toBe('adjust')
    expect(await getBalance(db, 'u1')).toBe(90)

    // 订单批次剩 40，奖励批次 50 未动。
    const grants = sqlite
      .prepare('SELECT remaining FROM credit_grants ORDER BY created_at')
      .all() as Array<{ remaining: number }>
    expect(grants.map((row) => row.remaining)).toEqual([40, 50])
  })

  it('扣到 0 为止，流水记录应扣与实际扣减的差额', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      reference: 'stripe:pi_1',
      idempotencyKey: 'grant_order',
    })
    await consumeCredits(db, { userId: 'u1', amount: 80, idempotencyKey: 'consume_1' })

    const clawback = await clawbackCredits(db, {
      userId: 'u1',
      reference: 'stripe:pi_1',
      amount: 100,
      reason: 'refund',
      idempotencyKey: 'refund-clawback:stripe:pi_1',
    })

    expect(clawback.deducted).toBe(20)
    expect(clawback.shortfall).toBe(80)
    expect(clawback.transaction.amount).toBe(-20)
    expect(await getBalance(db, 'u1')).toBe(0)
    expect(JSON.parse(clawback.transaction.metadata ?? '{}')).toMatchObject({
      reason: 'refund',
      expected: 100,
      deducted: 20,
      shortfall: 80,
    })
  })

  it('同一幂等键重复反扣只生效一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u1')
    await grantCredits(db, {
      userId: 'u1',
      amount: 100,
      source: 'purchase',
      reference: 'stripe:pi_1',
      idempotencyKey: 'grant_order',
    })

    const first = await clawbackCredits(db, {
      userId: 'u1',
      reference: 'stripe:pi_1',
      amount: 40,
      idempotencyKey: 'claw_1',
    })
    const second = await clawbackCredits(db, {
      userId: 'u1',
      reference: 'stripe:pi_1',
      amount: 40,
      idempotencyKey: 'claw_1',
    })

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(await getBalance(db, 'u1')).toBe(60)
    expect(await listTransactions(db, 'u1')).toHaveLength(2)
  })
})
