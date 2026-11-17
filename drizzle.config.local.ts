import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle 本地配置：普通 SQLite 文件（`file:` URL），用于本地 studio 与本地推送。
 *
 * 生产与远端 D1 走 `drizzle.config.ts`。
 */
export default defineConfig({
  schema: './src/core/db/schema.ts',
  out: './src/core/db/migrations/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE_URL ?? 'file:./src/core/db/migrations/sqlite/dev.db',
  },
  verbose: true,
  strict: true,
})
