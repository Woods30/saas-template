#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { resolveLookupKey } from '../src/config/products'

/**
 * 为 E2E 写入一条「已订阅」记录：E2E 不能真打 Stripe，故直接写本地 D1。
 * `--local` 硬编码，绝不触碰生产库。
 *
 * 用法：`pnpm exec tsx scripts/e2e-seed-subscription.ts <email>`
 *
 * `amount` / `currency` / `interval` 必须一并填上，否则账单页金额列渲染成 `—`。
 * 这些值从 Stripe 按 `lookup_key` 实时取：写死金额会让 E2E 断言的是一个
 * 早已不存在的价格。
 */

/** 与本地 D1 的 `subscriptions` 列一一对应，避免拼 SQL 时漏字段。 */
interface SeedSubscription {
  id: string
  userId: string
  customerId: string
  subscriptionId: string
  /** 订阅状态。历史行写 `canceled`：账单页把它收进「历史订阅」。 */
  status: 'active' | 'canceled'
  priceId: string
  /** 本站产品 id。 */
  productId: string
  /** Stripe Product id；买断接管旧订阅的兜底判据。 */
  stripeProductId: string | null
  amount: number
  currency: string
  interval: string
  /** Unix 秒；写未来时间，让用例能断言「续费日期」确实渲染了具体时刻。 */
  currentPeriodEnd: number
  /**
   * 创建时间（Unix 秒）。
   *
   * 给出时写入 `created_at`：历史行必须比当前行旧，否则「最近一份」的判定会把它
   * 当成当前方案。
   */
  createdAt?: number
  /**
   * 已安排、周期末生效的变更（降级）。
   *
   * 给出时写入 `pending_*` 列：账单页会显示「已安排变更」提示块——降级期间用户
   * 仍在按旧价扣款，页面必须说清这一点。
   */
  pending?: {
    priceId: string
    productId: string
    stripeProductId: string | null
    interval: string
    amount: number
    currency: string
    /** Unix 秒；生效时刻 = 当前周期的结束时刻。 */
    effectiveAt: number
  }
}

/** 读 `.env` 里的值；空串由调用方报错。 */
function readEnv(key: string): string {
  const parsed = parseEnv(readFileSync('.env', 'utf-8')) as Record<string, string>
  return parsed[key]?.trim() ?? ''
}

/** Stripe Price 的必要字段。 */
interface StripePrice {
  id: string
  unit_amount: number | null
  currency: string
  recurring: { interval?: string } | null
  /** Stripe Product id；买断接管旧订阅的兜底判据。 */
  product?: string | { id?: string } | null
}

/**
 * 按 `lookup_key` 取 Stripe 上的 Price。
 *
 * 与线上取值走同一条链路（`lookup_keys[]` → Prices API），保证 E2E 造出来的
 * 订阅行与真实订阅在价格、币种、周期上一致。
 */
export async function fetchPriceByLookupKey(
  lookupKey: string,
  secretKey: string,
): Promise<StripePrice> {
  const url = new URL('https://api.stripe.com/v1/prices')
  url.searchParams.append('lookup_keys[]', lookupKey)
  const response = await fetch(url, { headers: { authorization: `Bearer ${secretKey}` } })
  if (!response.ok) {
    throw new Error(`Stripe Prices API 返回 ${response.status}`)
  }
  const body = (await response.json()) as { data?: StripePrice[] }
  const price = body.data?.[0]
  if (!price) throw new Error(`Stripe 上没有 lookup_key=${lookupKey} 的 Price`)
  return price
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
  const columns = [
    'id',
    'user_id',
    'customer_id',
    'subscription_id',
    'status',
    'price_id',
    'product_id',
    'stripe_product_id',
    'amount',
    'currency',
    'interval',
    // 必须是整数 Unix 秒：写成 `datetime(...)` 会得到 TEXT，读回转不成 Date，渲染成 `—`。
    'current_period_end',
  ]
  const values: Array<string | number | null> = [
    sub.id,
    sub.userId,
    sub.customerId,
    sub.subscriptionId,
    sub.status,
    sub.priceId,
    sub.productId,
    sub.stripeProductId,
    sub.amount,
    sub.currency,
    sub.interval,
    sub.currentPeriodEnd,
  ]
  if (sub.createdAt !== undefined) {
    columns.push('created_at')
    values.push(sub.createdAt)
  }
  if (sub.pending) {
    columns.push(
      'pending_price_id',
      'pending_product_id',
      'pending_stripe_product_id',
      'pending_interval',
      'pending_amount',
      'pending_currency',
      'pending_effective_at',
    )
    values.push(
      sub.pending.priceId,
      sub.pending.productId,
      sub.pending.stripeProductId,
      sub.pending.interval,
      sub.pending.amount,
      sub.pending.currency,
      sub.pending.effectiveAt,
    )
  }
  const quoted = values.map((v) => {
    if (v === null) return 'NULL'
    return typeof v === 'number' ? v : `'${escapeSql(String(v))}'`
  })
  return `INSERT INTO subscriptions (${columns.join(', ')}) VALUES (${quoted.join(', ')})`
}

async function main(): Promise<void> {
  const email = process.argv[2]
  if (!email) {
    console.error(
      '用法：pnpm exec tsx scripts/e2e-seed-subscription.ts <email> [--pending] [--history]',
    )
    process.exit(1)
  }
  // `--pending`：额外写一份「已安排、周期末生效」的降级，用来测账单页的待生效提示。
  const withPending = process.argv.includes('--pending')
  // `--history`：额外写一份已取消的旧订阅，用来测「历史订阅」区块。
  const withHistory = process.argv.includes('--history')

  // lookup_key 写在产品配置里（`src/config/products.ts`），不再从 env 读。
  const lookupKey = resolveLookupKey('pro', 'month')
  if (!lookupKey) {
    console.error('❌ 产品配置里没有 pro 产品的月付 lookup_key，无法构造订阅行')
    process.exit(1)
  }
  const secretKey = readEnv('STRIPE_SECRET_KEY')
  if (!secretKey) {
    console.error('❌ .env 未配置 STRIPE_SECRET_KEY，无法向 Stripe 查询真实价格')
    process.exit(1)
  }

  // 价格取自 Stripe：写死金额会让 E2E 断言一个早已不存在的价格。
  let price: StripePrice
  try {
    price = await fetchPriceByLookupKey(lookupKey, secretKey)
  } catch (err) {
    console.error(`❌ 取价失败：${err instanceof Error ? err.message : 'unknown'}`)
    process.exit(1)
  }
  if (price.unit_amount === null) {
    console.error('❌ 该 Price 是阶梯计价，没有单一金额，无法构造订阅行')
    process.exit(1)
  }

  const userId = findUserIdByEmail(email)
  if (!userId) {
    console.error(`❌ 本地 D1 找不到用户：${email}`)
    process.exit(1)
  }

  // 年付价：待生效的降级与历史订阅都用它，金额同样取自 Stripe，不能写死。
  let yearlyPrice: (StripePrice & { unit_amount: number }) | null = null
  if (withPending || withHistory) {
    const yearlyLookupKey = resolveLookupKey('pro', 'year')
    if (!yearlyLookupKey) {
      console.error('❌ 产品配置里没有 pro 产品的年付 lookup_key，无法构造年付订阅行')
      process.exit(1)
    }
    let fetched: StripePrice
    try {
      fetched = await fetchPriceByLookupKey(yearlyLookupKey, secretKey)
    } catch (err) {
      console.error(`❌ 取年付价格失败：${err instanceof Error ? err.message : 'unknown'}`)
      process.exit(1)
    }
    if (fetched.unit_amount === null) {
      console.error('❌ 年付的 Price 是阶梯计价，没有单一金额，无法构造年付订阅行')
      process.exit(1)
    }
    yearlyPrice = { ...fetched, unit_amount: fetched.unit_amount }
  }

  // 待生效的降级：目标价同样取自 Stripe，不能写死金额。
  let pending: SeedSubscription['pending']
  if (withPending && yearlyPrice) {
    pending = {
      priceId: yearlyPrice.id,
      productId: 'pro',
      stripeProductId:
        typeof yearlyPrice.product === 'string'
          ? yearlyPrice.product
          : (yearlyPrice.product?.id ?? null),
      interval: yearlyPrice.recurring?.interval ?? 'year',
      amount: yearlyPrice.unit_amount,
      currency: yearlyPrice.currency,
      // 生效时刻 = 当前周期的结束时刻，与当前价的续费时刻一致。
      effectiveAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }
  }

  // 时间戳 + 随机段：同一邮箱重复 seed 时主键不撞。
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const sql = buildSeedSql({
    id: `sub_e2e_${unique}`,
    userId,
    customerId: `cus_e2e_${unique}`,
    subscriptionId: `sub_e2e_stripe_${unique}`,
    status: 'active',
    priceId: price.id,
    productId: 'pro',
    stripeProductId:
      typeof price.product === 'string' ? price.product : (price.product?.id ?? null),
    amount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval ?? 'one_time',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    ...(pending ? { pending } : {}),
  })

  execFileSync('wrangler', ['d1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    stdio: 'inherit',
  })

  // 历史订阅：一份已取消的旧订阅（年付），用来测「历史订阅」区块。
  // `created_at` 必须比当前行旧——否则「最近一份」的判定会把它当成当前方案。
  if (withHistory && yearlyPrice) {
    const historySql = buildSeedSql({
      id: `sub_e2e_hist_${unique}`,
      userId,
      customerId: `cus_e2e_${unique}`,
      subscriptionId: `sub_e2e_stripe_hist_${unique}`,
      status: 'canceled',
      priceId: yearlyPrice.id,
      productId: 'pro',
      stripeProductId:
        typeof yearlyPrice.product === 'string'
          ? yearlyPrice.product
          : (yearlyPrice.product?.id ?? null),
      amount: yearlyPrice.unit_amount,
      currency: yearlyPrice.currency,
      interval: yearlyPrice.recurring?.interval ?? 'year',
      currentPeriodEnd: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
      createdAt: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 60,
    })
    execFileSync(
      'wrangler',
      ['d1', 'execute', 'DB', '--local', '--json', '--command', historySql],
      {
        stdio: 'inherit',
      },
    )
  }

  console.log(`✅ 已为 ${email} 写入 active 订阅`)
}

// 与 set-admin.ts 同一约定：被 import 时不执行 main。
if (process.argv[1]?.includes('e2e-seed-subscription')) {
  main().catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : 'unknown'}`)
    process.exit(1)
  })
}
