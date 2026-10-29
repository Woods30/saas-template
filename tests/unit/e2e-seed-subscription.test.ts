import { describe, expect, it } from 'vitest'
import {
  buildLocalD1Args,
  buildSeedSql,
  buildUserSeedSql,
} from '../../scripts/e2e-seed-subscription'

describe('buildUserSeedSql', () => {
  it('本地账号同时具有已验证邮箱和 credential 密码记录，字符串安全转义', () => {
    const sql = buildUserSeedSql({
      id: 'e2e-user-1',
      email: "o'brien@example.com",
      name: "O'Brien",
      passwordHash: 'salt:hash',
    })
    expect(sql).toContain('INSERT INTO users (id, email, name, email_verified)')
    expect(sql).toContain("'e2e-user-1', 'o''brien@example.com', 'O''Brien', 1")
    expect(sql).toContain('INSERT INTO accounts')
    expect(sql).toContain("'credential'")
    expect(sql).toContain("'salt:hash'")
    expect(sql).not.toContain('INSERT INTO sessions')
  })
})

describe('buildLocalD1Args', () => {
  it('隔离目录应用于所有本地 SQL，始终保留 --local', () => {
    expect(buildLocalD1Args('SELECT 1', '.wrangler/payment-e2e-state')).toEqual([
      'd1',
      'execute',
      'DB',
      '--local',
      '--json',
      '--persist-to',
      '.wrangler/payment-e2e-state',
      '--command',
      'SELECT 1',
    ])
  })
})

/**
 * seed 脚本的 SQL 构造（数据形状而非执行）：字段写错不会报错，只会让账单页显示 `—`，
 * 看起来像产品 bug。
 */
describe('buildSeedSql', () => {
  const base = {
    id: 'sub_e2e_abc123',
    userId: 'user_1',
    customerId: 'cus_e2e_abc123',
    subscriptionId: 'sub_e2e_stripe_abc123',
    status: 'active' as const,
    priceId: 'price_1USEaeK7geIdVnsajOAqUpyJ',
    productId: 'pro',
    stripeProductId: 'prod_e2e_pro',
    amount: 599,
    currency: 'usd' as const,
    interval: 'month' as const,
    currentPeriodEnd: 1797690509,
  }

  it('INSERT 覆盖账单页需要的全部列', () => {
    const sql = buildSeedSql(base)
    for (const column of [
      'user_id',
      'customer_id',
      'subscription_id',
      'status',
      'price_id',
      'product_id',
      'offer_id',
      'amount',
      'currency',
      'interval',
      'current_period_end',
    ]) {
      expect(sql, `缺少列 ${column}`).toContain(column)
    }
    expect(sql).toContain('INSERT INTO subscriptions')
  })

  it('current_period_end 是裸整数，不套 datetime()', () => {
    // 写成 `datetime(...)` 会得到 TEXT，读回时转不成 Date，账单页渲染成 `—`。
    const sql = buildSeedSql(base)
    expect(sql).not.toContain('datetime(')
    expect(sql).toContain(String(base.currentPeriodEnd))
  })

  it('字符串值加引号，数字不加', () => {
    const sql = buildSeedSql(base)
    expect(sql).toContain(`'${base.userId}'`)
    expect(sql).toContain(`'${base.priceId}'`)
    // 金额被引号包住会变成文本比较，`WHERE amount > 0` 失效。
    expect(sql).toMatch(/[^']599(?!\d)/)
  })

  it('单引号转义为两个，避免值里带引号时语法崩掉', () => {
    const sql = buildSeedSql({ ...base, userId: "o'brien" })
    expect(sql).toContain("'o''brien'")
    // 不变量：字符串字面量偶数闭合。忘了转义时 `'o'brien'` 会让 SQLite 报语法错。
    const quoteCount = (value: string) => (value.match(/'/g) ?? []).length
    expect(quoteCount(sql)).toBe(quoteCount(buildSeedSql(base)) + 2)
  })

  it('status 写 active，让重复订阅守卫命中', () => {
    expect(buildSeedSql(base)).toContain("'active'")
  })

  it('给了创建时间就写 created_at：历史行必须比当前行旧', () => {
    // 不写 created_at 时历史行与当前行同刻，「最近一份」的判定会挑错。
    const sql = buildSeedSql({ ...base, createdAt: 1767225600 })
    expect(sql).toContain('created_at')
    expect(sql).toContain('1767225600')
  })

  it('没给创建时间就不写 created_at 列', () => {
    expect(buildSeedSql(base)).not.toContain('created_at')
  })
})
