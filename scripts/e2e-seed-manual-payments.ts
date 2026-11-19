#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { buildLocalD1Args, escapeSql, executeLocalD1 } from './e2e-seed-subscription'

/** 只取 D1 JSON 输出的轻量封装（用于查询型命令）。 */
function executeLocalD1Json(
  sql: string,
  persistTo?: string,
): Array<{ results?: Array<Record<string, unknown>> }> {
  const out = execFileSync('wrangler', buildLocalD1Args(sql, persistTo), {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out)
}

/**
 * 为 E2E 写入核销型支付（manual payments）的测试数据，只写本地 D1，不访问 Stripe /
 * 支付宝。与 `e2e-seed-subscription.ts` 同一约定：`--local` 硬编码，绝不触碰生产库。
 *
 * 子命令：
 * - `<email> [--admin]`：seed 用户 + 数据库覆盖收款账户行；
 * - `--query-order <orderId>`：输出订单行的 JSON（base_amount / fingerprint）；
 * - `--fill-fingerprints <base> <except>`：占住 base 上除 `except` 外的 98 个尾数。
 */
function readEnv(key: string): string {
  const parsed = parseEnv(readFileSync('.env', 'utf-8')) as Record<string, string>
  return parsed[key]?.trim() ?? ''
}

/** 数据库覆盖收款账户行（`manual_payment_accounts`）。 */
export function buildAccountSeedSql(input: {
  id: string
  displayName: string
  enabled: boolean
}): string {
  const quote = (value: string) => `'${escapeSql(value)}'`
  return `INSERT INTO manual_payment_accounts (id, channel, display_name, currency, enabled) VALUES (${quote(input.id)}, 'alipay', ${quote(input.displayName)}, 'cny', ${input.enabled ? 1 : 0}) ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, enabled = excluded.enabled`
}

/**
 * 占住指定收款账户在 `base` 上除 `exceptFingerprint` 外的全部尾数（1–99）。
 *
 * E2E 用它做确定性验证：把其余 98 个尾数全占住后，被取消订单释放的那个尾数
 * 就是唯一空位，新订单必然复用同一应付金额（随机起点扫到它为止）。占位行
 * `expires_at` 设到 1 小时后，在整个测试期间一直处于活跃集合。
 */
export function buildFingerprintHolderSql(input: {
  accountId: string
  userId: string
  base: number
  currency: string
  /** 保留给被测订单的尾数。 */
  exceptFingerprint: number
  /** 占位行的过期时间（Unix 秒）。 */
  expiresAt: number
}): string {
  const orders: string[] = []
  const details: string[] = []
  for (let fp = 1; fp <= 99; fp++) {
    if (fp === input.exceptFingerprint) continue
    // 订单与详情 1:1，共用同一个 id（详情主键 `order_id`）。
    const orderId = crypto.randomUUID()
    orders.push(
      `('${orderId}', 'ord_e2e_${orderId}', '${escapeSql(input.userId)}', 'manual_payments', 'payment', 'e2e-holder', 'e2e-one-time', 'open', ${input.expiresAt}, ${input.expiresAt})`,
    )
    details.push(
      `('${orderId}', '${escapeSql(input.userId)}', '${escapeSql(input.accountId)}', 'alipay', NULL, NULL, ${input.base}, ${fp}, ${input.base + fp}, '${escapeSql(input.currency)}', 'pending_payment', ${input.expiresAt}, ${input.expiresAt}, ${input.expiresAt})`,
    )
  }
  return `INSERT INTO orders (id, order_no, user_id, provider, mode, product_id, offer_id, status, created_at, updated_at) VALUES ${orders.join(', ')}; INSERT INTO manual_payment_details (order_id, user_id, account_id, channel, qr_image_url, qr_image_key, base_amount, fingerprint, payable_amount, currency, status, expires_at, created_at, updated_at) VALUES ${details.join(', ')}`
}

async function main(): Promise<void> {
  const persistIndex = process.argv.indexOf('--persist-to')
  const persistTo = persistIndex >= 0 ? process.argv[persistIndex + 1] : undefined
  if (persistIndex >= 0 && (!persistTo || persistTo.startsWith('--'))) {
    throw new Error('--persist-to 必须指定本地目录')
  }

  if (process.argv.includes('--query-order')) {
    const idx = process.argv.indexOf('--query-order')
    const orderId = process.argv[idx + 1]
    if (!orderId) throw new Error('--query-order 需要 <orderId>')
    const rows = executeLocalD1Json(
      `SELECT base_amount, fingerprint FROM manual_payment_details WHERE order_id = '${escapeSql(orderId)}'`,
      persistTo,
    )
    const row = rows[0]?.results?.[0]
    if (!row) throw new Error(`本地 D1 找不到订单 ${orderId}`)
    // JSON 写 stdout 供 spec 解析；提示走 stderr。
    console.log(JSON.stringify({ baseAmount: row.base_amount, fingerprint: row.fingerprint }))
    return
  }

  if (process.argv.includes('--fill-fingerprints')) {
    const idx = process.argv.indexOf('--fill-fingerprints')
    const base = Number(process.argv[idx + 1])
    const except = Number(process.argv[idx + 2])
    if (!Number.isInteger(base) || !Number.isInteger(except)) {
      throw new Error('--fill-fingerprints 需要 <base> <exceptFingerprint> 两个整数')
    }
    const userIdRows = executeLocalD1Json(
      'SELECT id FROM users ORDER BY created_at DESC LIMIT 1',
      persistTo,
    )
    const userId = userIdRows[0]?.results?.[0]?.id
    if (!userId) throw new Error('本地 D1 没有任何用户，无法放置占位行')
    // 先清掉该账户除被测单外的全部活跃订单：之前用例留下的 pending_payment /
    // pending_verification 也占尾数，不清会让占位撞唯一索引、池子也不完整。
    // 先删详情再删订单（详情外键指向 orders），并顺手清掉没有详情的核销订单，
    // 避免每轮 fill 都留下孤儿订单行。
    executeLocalD1(
      `DELETE FROM manual_payment_details WHERE account_id = 'alipay-e2e' AND status IN ('pending_payment','pending_verification','settling') AND payable_amount != ${base + except};
DELETE FROM orders WHERE provider = 'manual_payments' AND id NOT IN (SELECT order_id FROM manual_payment_details)`,
      persistTo,
    )
    executeLocalD1(
      buildFingerprintHolderSql({
        accountId: 'alipay-e2e',
        userId: String(userId),
        base,
        currency: 'cny',
        exceptFingerprint: except,
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
      }),
      persistTo,
    )
    console.error(`✅ 已占住 base=${base} 上除 ${except} 外的 98 个尾数`)
    return
  }

  const email = process.argv[2]
  if (!email || email.startsWith('--')) {
    console.error(
      '用法：pnpm exec tsx scripts/e2e-seed-manual-payments.ts <email> [--admin]\n' +
        '       … --query-order <orderId> | --fill-fingerprints <base> <except>',
    )
    process.exit(1)
  }

  const { seedVerifiedUser } = await import('./e2e-seed-subscription')
  // 优先 process.env（Playwright spec 显式传入），再回退 .env 与脚本默认值。
  const password =
    process.env.E2E_TEST_PASSWORD || readEnv('E2E_TEST_PASSWORD') || 'e2e-manual-payments-password'
  await seedVerifiedUser({
    email,
    name: '核销测试用户',
    password,
    role: process.argv.includes('--admin') ? 'admin' : undefined,
  })

  // 数据库覆盖账户：与 E2E 环境里 `VITE_MANUAL_PAYMENT_ACCOUNTS` 的兜底同 ID，
  // 覆盖只改显示名与启用状态；二维码仍来自源码兜底（E2E 不传 R2 key）。
  executeLocalD1(
    buildAccountSeedSql({ id: 'alipay-e2e', displayName: 'E2E 收款账户', enabled: true }),
    persistTo,
  )

  console.log(
    `✅ 已为 ${email} 写入核销测试数据${process.argv.includes('--admin') ? '（admin）' : ''}`,
  )
}

// 与 e2e-seed-subscription.ts 同一约定：被 import 时不执行 main。
if (process.argv[1]?.includes('e2e-seed-manual-payments')) {
  main().catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : 'unknown'}`)
    process.exit(1)
  })
}
