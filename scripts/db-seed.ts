/**
 * 写入种子数据。
 *
 * 用法：
 * - `pnpm db:seed`         本地 D1
 * - `pnpm db:seed:remote`  远端 D1
 * - `pnpm db:seed:pg`      PostgreSQL（读 `DATABASE_URL`）
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
import { type DatabaseProvider, resolveDatabaseProvider } from '../src/core/db/provider'

/** SQL 字符串字面量转义。 */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * 生成种子 SQL。
 *
 * 默认只补缺失的（`DO NOTHING`）：种子是「让站点能跑起来」，不是「把后台改过的
 * 配置冲掉」。要覆盖用 `--force`。
 */
export function buildSeedSql(settings: SettingsGroups, force: boolean): string {
  const conflict = force
    ? 'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at'
    : 'ON CONFLICT (key) DO NOTHING'
  const lines = Object.entries(settings).map(
    ([key, value]) =>
      `INSERT INTO settings (key, value, updated_at) VALUES (${sqlString(key)}, ${sqlString(
        JSON.stringify(value),
      )}, ${force ? 'EXCLUDED.updated_at' : "strftime('%s','now')"}) ${conflict};`,
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

  const sql = buildSeedSql(defaultSettings(), force)
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
