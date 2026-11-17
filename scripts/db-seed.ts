/**
 * 写入种子数据。
 *
 * 用法：
 * - `pnpm db:seed`         本地 D1
 * - `pnpm db:seed:remote`  远端 D1
 * - `pnpm db:seed:pg`      PostgreSQL（读 `DATABASE_URL`）
 * - `--brand <名>`         把品牌名换成自己的（替代已废弃的 `pnpm run init --name`）
 * - `--email <地址>`       把支持邮箱换成自己的
 * - `--force`              覆盖已有值（默认只补缺失的，不动后台改过的配置）
 *
 * 种子内容：站点配置的六组默认值。后续里程碑的 RBAC 权限点、分类等也在这里追加。
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defaultSettings, type SettingsGroups } from '../src/core/config/settings'
import {
  type DatabaseProvider,
  type Dialect,
  dialectOf,
  resolveDatabaseProvider,
} from '../src/core/db/provider'

/** 命令行覆盖项：把出厂值换成使用者的。 */
export interface SeedOverrides {
  brandName?: string
  brandTagline?: string
  supportEmail?: string
}

/**
 * 解析覆盖项。
 *
 * 只认三个带值的参数，其余参数（`--local` / `--remote` / `--pg` / `--force`）
 * 由调用方处理。
 */
export function parseSeedOverrides(argv: string[]): SeedOverrides {
  const overrides: SeedOverrides = {}
  const flags: Array<[string, keyof SeedOverrides]> = [
    ['--brand', 'brandName'],
    ['--tagline', 'brandTagline'],
    ['--email', 'supportEmail'],
  ]

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) continue
    const match = flags.find(([name]) => name === arg)
    if (!match) continue
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`${match[0]} 缺少取值`)
    overrides[match[1]] = value
    index++
  }
  return overrides
}

/** 把覆盖项落到配置上；未覆盖的字段保持出厂值。 */
export function applySeedOverrides(
  settings: SettingsGroups,
  overrides: SeedOverrides,
): SettingsGroups {
  return {
    ...settings,
    brand: {
      ...settings.brand,
      ...(overrides.brandName !== undefined ? { name: overrides.brandName } : {}),
      ...(overrides.brandTagline !== undefined ? { tagline: overrides.brandTagline } : {}),
    },
    mail: {
      ...settings.mail,
      ...(overrides.supportEmail !== undefined ? { supportEmail: overrides.supportEmail } : {}),
    },
  }
}

/** SQL 字符串字面量转义。 */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * 生成种子 SQL。
 *
 * 默认只补缺失的（`DO NOTHING`）：种子是「让站点能跑起来」，不是「把后台改过的
 * 配置冲掉」。要覆盖用 `--force`。
 *
 * 时间戳表达式随方言走：SQLite 系用 `strftime('%s','now')`（列是整数秒），
 * PostgreSQL 用 `now()`（列是 timestamptz）。写成一边通用的写法会在另一边直接报错。
 *
 * `EXCLUDED` 只在 `DO UPDATE SET` 里合法，VALUES 里不能用——所以时间戳在两处
 * 都直接写表达式。
 */
export function buildSeedSql(settings: SettingsGroups, force: boolean, dialect: Dialect): string {
  const now = dialect === 'postgresql' ? 'now()' : "strftime('%s','now')"
  const conflict = force
    ? `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = ${now}`
    : 'ON CONFLICT (key) DO NOTHING'
  const lines = Object.entries(settings).map(
    ([key, value]) =>
      `INSERT INTO settings (key, value, updated_at) VALUES (${sqlString(key)}, ${sqlString(
        JSON.stringify(value),
      )}, ${now}) ${conflict};`,
  )
  return `${lines.join('\n')}\n`
}

/** 执行种子 SQL：SQLite / D1 走 wrangler，PostgreSQL 走 postgres 客户端。 */
async function applySeed(sql: string, provider: DatabaseProvider, target: string): Promise<number> {
  if (provider === 'postgres' || target === 'pg') {
    const { default: postgres } = await import('postgres')
    const url = process.env.DATABASE_URL
    if (!url) {
      console.error('db:seed:pg 需要 DATABASE_URL')
      return 1
    }
    const client = postgres(url, { prepare: false, max: 1 })
    try {
      await client.unsafe(sql)
    } finally {
      await client.end()
    }
    return 0
  }

  const dir = mkdtempSync(join(tmpdir(), 'db-seed-'))
  const file = join(dir, 'seed.sql')
  writeFileSync(file, sql, 'utf8')
  const remote = target === 'remote' ? '--remote' : '--local'
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', remote, '--file', file],
    { stdio: 'inherit' },
  )
  return result.status ?? 1
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
  const force = argv.includes('--force')
  const target = argv.includes('--remote') ? 'remote' : argv.includes('--pg') ? 'pg' : 'local'
  const overrides = parseSeedOverrides(argv)

  // provider 是 postgres 时只写 PG：`db:seed` 走的是 D1，SQL 方言对不上。
  if (provider === 'postgres' && target !== 'pg') {
    console.error('DATABASE_PROVIDER=postgres 时请用 pnpm db:seed:pg')
    return 1
  }

  // 方言由写入目标决定：写到 PG 用 PG 方言，写到 D1 用 sqlite 方言。
  const dialect: Dialect = target === 'pg' ? 'postgresql' : dialectOf(provider)

  const settings = applySeedOverrides(defaultSettings(), overrides)
  const sql = buildSeedSql(settings, force, dialect)
  console.log(`写入种子数据（provider=${provider} 目标=${target}${force ? ' 覆盖' : ''}）`)
  const code = await applySeed(sql, provider, target)
  if (code === 0) console.log('✅ 种子数据写入完成')
  return code
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exit(await run())
}
