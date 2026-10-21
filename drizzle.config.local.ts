import { defineConfig } from 'drizzle-kit'

// 本地：不设 `driver` 即按 `dbCredentials.url` 连普通 SQLite 文件。
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./src/db/migrations/dev.db',
  },
  verbose: true,
  strict: true,
})
