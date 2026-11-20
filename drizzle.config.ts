import { defineConfig } from 'drizzle-kit'
import { dialectOf, migrationDirOf, resolveDatabaseProvider } from './src/core/db/provider'

/**
 * Drizzle 配置（按 DATABASE_PROVIDER 分派）。
 *
 * 注意 drizzle-kit 只读 `process.env`，不走 `src/core/env` 的两层校验。
 *
 * - `sqlite` / `d1`：D1 HTTP 驱动，连远端 D1（`db:generate` 不连库，只比对 schema）。
 * - `postgres`：直连连接串。
 *
 * 迁移输出按方言分目录：两个方言的 SQL 不可混用。
 */
const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
const out = `./src/core/db/migrations/${migrationDirOf(provider)}`

export default defineConfig(
  provider === 'postgres'
    ? {
        schema: './src/core/db/schema.ts',
        out,
        dialect: dialectOf(provider),
        dbCredentials: { url: process.env.DATABASE_URL ?? '' },
        verbose: true,
        strict: true,
      }
    : {
        schema: './src/core/db/schema.ts',
        out,
        dialect: dialectOf(provider),
        driver: 'd1-http',
        dbCredentials: {
          accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID ?? ''),
          databaseId: String(process.env.CLOUDFLARE_DATABASE_ID ?? ''),
          token: String(process.env.CLOUDFLARE_API_TOKEN ?? ''),
        },
        verbose: true,
        strict: true,
      },
)
