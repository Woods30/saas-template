#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/**
 * 为 E2E 写入一条「已订阅」记录：E2E 不能真打 Stripe，故直接写本地 D1。
 * `--local` 硬编码，绝不触碰生产库。
 *
 * 用法：`pnpm exec tsx scripts/e2e-seed-subscription.ts <email>`
 *
 * `amount` / `currency` / `interval` 必须一并填上，否则账单页金额列渲染成 `—`。
 */

/** 与本地 D1 的 `subscriptions` 列一一对应，避免拼 SQL 时漏字段。 */
interface SeedSubscription {
  id: string
  userId: string
  customerId: string
  subscriptionId: string
  status: 'active'
  priceId: string
  amount: number
  currency: 'usd'
  interval: 'month'
  /** Unix 秒；写未来时间，让用例能断言「续费日期」确实渲染了具体时刻。 */
  currentPeriodEnd: number
}

/** 读 `.env` 里的 Price ID；空串由调用方报错。 */
function readEnv(key: string): string {
  const parsed = parseEnv(readFileSync('.env', 'utf-8')) as Record<string, string>
  return parsed[key]?.trim() ?? ''
}

/** 按邮箱查本地 D1 的 users 表。 */
export function findUserIdByEmail(email: string): string | null {
  const sql = `SELECT id FROM users WHERE email = '${escapeSql(email)}'`
  const out = execFileSync(
    'wrangler',
    ['d1', 'execute', 'DB', '--local', '--json', '--command', sql],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const results = JSON.parse(out)[0]?.results ?? []
  return results[0]?.id ?? null
}

/** 单引号转义：SQL 字符串字面量里 `'` 写成两个。 */
function escapeSql(value: string): string {
  return value.split("'").join("''")
}

/** 构造 INSERT；导出供单测固定转义规则，防止改拼接方式时引入注入。 */
export function buildSeedSql(sub: SeedSubscription): string {
  const values = [
    sub.id,
    sub.userId,
    sub.customerId,
    sub.subscriptionId,
    sub.status,
    sub.priceId,
    sub.amount,
    sub.currency,
    sub.interval,
    // 必须是整数 Unix 秒：写成 `datetime(...)` 会得到 TEXT，读回转不成 Date，渲染成 `—`。
    sub.currentPeriodEnd,
  ]
  const quoted = values.map((v) => (typeof v === 'number' ? v : `'${escapeSql(String(v))}'`))
  return `INSERT INTO subscriptions (id, user_id, customer_id, subscription_id, status, price_id, amount, currency, interval, current_period_end) VALUES (${quoted.join(', ')})`
}

function main(): void {
  const email = process.argv[2]
  if (!email) {
    console.error('用法：pnpm exec tsx scripts/e2e-seed-subscription.ts <email>')
    process.exit(1)
  }

  const priceId = readEnv('VITE_STRIPE_PRICE_PRO_MONTHLY')
  if (!priceId) {
    console.error('❌ .env 未配置 VITE_STRIPE_PRICE_PRO_MONTHLY，无法构造与线上一致的订阅行')
    process.exit(1)
  }

  const userId = findUserIdByEmail(email)
  if (!userId) {
    console.error(`❌ 本地 D1 找不到用户：${email}`)
    process.exit(1)
  }

  // 时间戳 + 随机段：同一邮箱重复 seed 时主键不撞。
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const sql = buildSeedSql({
    id: `sub_e2e_${unique}`,
    userId,
    customerId: `cus_e2e_${unique}`,
    subscriptionId: `sub_e2e_stripe_${unique}`,
    status: 'active',
    priceId,
    amount: 599,
    currency: 'usd',
    interval: 'month',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  })

  execFileSync('wrangler', ['d1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    stdio: 'inherit',
  })
  console.log(`✅ 已为 ${email} 写入 active 订阅`)
}

// 与 set-admin.ts 同一约定：被 import 时不执行 main。
if (process.argv[1]?.includes('e2e-seed-subscription')) {
  main()
}
