/**
 * 按当前 `DATABASE_PROVIDER` 生成迁移。
 *
 * 用法：`pnpm db:generate`
 *
 * 与 `db:setup` 的分工：setup 负责「把 schema 生成物指到正确方言」，
 * generate 负责「把 schema 的变化写成迁移 SQL」。两者都读 `.env` 里的
 * `DATABASE_PROVIDER`（由 npm script 的 `--env-file-if-exists` 载入）。
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDatabaseProvider } from '../src/core/db/provider'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function run(): number {
  const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'generate', '--config=drizzle.config.ts'],
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
