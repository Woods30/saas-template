/**
 * 把 PostgreSQL 迁移应用到 `DATABASE_URL` 指向的库。
 *
 * 用法：`pnpm db:migrate:pg`
 *
 * 迁移不入库，所以这条命令的前提是本地已经跑过 `pnpm db:setup`（生成首份基线）
 * 或 `pnpm db:generate`（有新的 schema 变化时）。
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDatabaseProvider } from '../src/core/db/provider'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function run(): number {
  const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
  if (provider !== 'postgres') {
    console.error('db:migrate:pg 需要 DATABASE_PROVIDER=postgres')
    return 1
  }
  if (!process.env.DATABASE_URL) {
    console.error('db:migrate:pg 需要 DATABASE_URL')
    return 1
  }
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'migrate', '--config=drizzle.config.ts'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_PROVIDER: provider },
    },
  )
  return result.status ?? 1
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exit(run())
}
