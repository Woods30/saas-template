import { describe, expect, it } from 'vitest'
import { buildSeedSql } from '../../scripts/e2e-seed-subscription'

/**
 * seed 脚本的 SQL 构造。
 *
 * 守的是**数据形状**而不是执行：E2E 的「已订阅」状态由它写入本地 D1，写错一个字段
 * （`current_period_end` 写成 `datetime()` 得到 TEXT、状态值拼错）都会让用例失去意义
 * 而**不报错**——账单页只会显示 `—`，看起来像产品 bug。
 */
describe('buildSeedSql', () => {
  const base = {
    id: 'sub_e2e_abc123',
    userId: 'user_1',
    customerId: 'cus_e2e_abc123',
    subscriptionId: 'sub_e2e_stripe_abc123',
    status: 'active' as const,
    priceId: 'price_1USEaeK7geIdVnsajOAqUpyJ',
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
    // Drizzle 把该列声明为 `integer({ mode: 'timestamp' })`：写成 `datetime(...)` 会得到
    // TEXT，读回时转不成 Date，账单页渲染成 `—` 而所有断言仍会「通过」（因为没人断言它）。
    const sql = buildSeedSql(base)
    expect(sql).not.toContain('datetime(')
    expect(sql).toContain(String(base.currentPeriodEnd))
  })

  it('字符串值加引号，数字不加', () => {
    const sql = buildSeedSql(base)
    expect(sql).toContain(`'${base.userId}'`)
    expect(sql).toContain(`'${base.priceId}'`)
    // 金额若被引号包住，SQLite 会按文本比较，`WHERE amount > 0` 之类就失效。
    expect(sql).toMatch(/[^']599(?!\d)/)
  })

  it('单引号转义为两个，避免值里带引号时语法崩掉', () => {
    const sql = buildSeedSql({ ...base, userId: "o'brien" })
    expect(sql).toContain("'o''brien'")
    // 真正的不变量：字符串字面量仍然偶数闭合（一个开引号配一个闭引号）。
    // 若忘了转义，`'o'brien'` 会让 SQLite 在 `brien` 处报语法错，seed 直接失败。
    const quoteCount = (value: string) => (value.match(/'/g) ?? []).length
    expect(quoteCount(sql)).toBe(quoteCount(buildSeedSql(base)) + 2)
  })

  it('status 写 active，让重复订阅守卫命中', () => {
    expect(buildSeedSql(base)).toContain("'active'")
  })
})
