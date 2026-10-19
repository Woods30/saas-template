#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/**
 * 为 E2E 预备支付场景：给某个用户写入一条「已订阅」记录。
 *
 * 为什么需要它：重复订阅守卫（409）与账单页的四列展示，都要求库里已经存在一条
 * `active` 订阅。而 E2E 不能真的去打 Stripe——那需要真实银行卡、且会把测试账号的
 * 订阅状态留在 Stripe 后台。因此这里**直接写本地 D1**，把「已订阅」这一状态复现出来。
 *
 * 只动本地库：`--local` 是硬编码的。生产库由 `db:migrate:remote` 等显式命令管理，
 * 这个脚本绝不参与。
 *
 * 用法：
 *   pnpm exec tsx scripts/e2e-seed-subscription.ts <email>
 *
 * 写什么：一行 `subscriptions`，`price_id` 指向 `VITE_STRIPE_PRICE_PRO_MONTHLY`，
 * `amount` / `currency` / `interval` 三个列一并填上——账单页的金额列显示 `—` 正是
 * 因为这三个列空着（见 `handleSubscriptionUpsert` 的注释）。缺失时页面拿不到可展示的
 * 数据，用例就失去意义。
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

/** 读 `.env` 里的 Price ID；空串视为未配置，由调用方报错。 */
function readEnv(key: string): string {
  const parsed = parseEnv(readFileSync('.env', 'utf-8')) as Record<string, string>
  return parsed[key]?.trim() ?? ''
}

/** 按邮箱查本地 D1 的 users 表，返回用户 id。 */
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

/**
 * 构造 INSERT。
 *
 * 导出是为了单测：这条 SQL 拼的是用户 id 与 price id，两者都来自本地库 / `.env`，
 * 但转义规则必须被固定住，否则将来有人改拼接方式时会引入注入。
 */
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
    // 必须是**整数** Unix 秒。Drizzle 把该列声明为 `integer(..., { mode: 'timestamp' })`，
    // 写成 `datetime(...)` 会得到 TEXT，读回时转不成 Date，账单页就渲染成 `—`。
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

  // 时间戳 + 随机段：同一邮箱重复 seed 时 id 与 subscription_id 不撞（`id` 是主键）。
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
