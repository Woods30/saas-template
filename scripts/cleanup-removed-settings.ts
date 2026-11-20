/**
 * 删除已从配置注册表移除的 `settings` 行。
 *
 * 用法：
 * - `pnpm db:cleanup:settings`         本地 D1
 * - `pnpm db:cleanup:settings:remote`  远端 D1
 * - `pnpm db:cleanup:settings:pg`      PostgreSQL（读 `DATABASE_URL`）
 *
 * 本任务只清理两类孤儿键：能力开关 `features.*` 与认证总闸 `modules.auth`。
 * 条件删除是幂等的——第二次执行不会命中任何行，升级脚本可以安全重跑。
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDatabaseProvider } from '../src/core/db/provider'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 孤儿行的判定条件；SQLite 与 PostgreSQL 都支持 `RETURNING`，用返回行数统计删除量。 */
const ORPHAN_SETTINGS_WHERE = "key LIKE 'features.%' OR key = 'modules.auth'"

export function buildCleanupSettingsSql(): string {
  return `DELETE FROM settings WHERE ${ORPHAN_SETTINGS_WHERE} RETURNING key;`
}

interface D1Result {
  results?: unknown[]
}

/** wrangler `--json` 输出形如 `[{ results, success, meta }]`。 */
function rowsRemovedFromD1Output(stdout: string): number {
  const parsed: unknown = JSON.parse(stdout)
  if (!Array.isArray(parsed)) throw new Error('输出不是 JSON 数组')
  return (parsed as D1Result[]).reduce(
    (total, item) => total + (Array.isArray(item.results) ? item.results.length : 0),
    0,
  )
}

/** 返回删除行数；失败返回 -1（与真实计数区分）。 */
async function cleanupD1(sql: string, remote: boolean): Promise<number> {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'DB',
      remote ? '--remote' : '--local',
      '--yes',
      '--json',
      '--command',
      sql,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '')
    return -1
  }
  try {
    return rowsRemovedFromD1Output(result.stdout)
  } catch (error) {
    console.error(`无法解析 wrangler 输出：${(error as Error).message}`)
    return -1
  }
}

/** 返回删除行数；失败返回 -1。 */
async function cleanupPostgres(sql: string): Promise<number> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('db:cleanup:settings:pg 需要 DATABASE_URL')
    return -1
  }
  const { default: postgres } = await import('postgres')
  const client = postgres(url, { prepare: false, max: 1 })
  try {
    const rows = await client.unsafe(sql)
    return rows.length
  } finally {
    await client.end()
  }
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
  const target = argv.includes('--remote') ? 'remote' : argv.includes('--pg') ? 'pg' : 'local'

  // `db:setup` / `db:seed` 的口径一致：provider 是 postgres 时只写 PG。
  if (provider === 'postgres' && target !== 'pg') {
    console.error('DATABASE_PROVIDER=postgres 时请用 pnpm db:cleanup:settings:pg')
    return 1
  }

  const sql = buildCleanupSettingsSql()
  const removed =
    target === 'pg' ? await cleanupPostgres(sql) : await cleanupD1(sql, target === 'remote')
  if (removed < 0) return 1

  console.log(`已清理 ${removed} 条已移除的配置项。`)
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exit(await run())
}
