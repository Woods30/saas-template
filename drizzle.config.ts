import { defineConfig } from 'drizzle-kit'

// 生产：经 Cloudflare HTTP API 连 D1。注意 drizzle-kit 只读 `process.env`，
// 不走 `src/env` 的两层校验。
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID),
    databaseId: String(process.env.CLOUDFLARE_DATABASE_ID),
    token: String(process.env.CLOUDFLARE_API_TOKEN),
  },
  verbose: true,
  strict: true,
})
