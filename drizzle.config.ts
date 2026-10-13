import { defineConfig } from 'drizzle-kit'

// Remote/production config: uses D1 via Cloudflare Workers HTTP API.
// dialect + driver + dbCredentials match drizzle-kit@0.31.11 Config type:
//   { dialect: 'sqlite', driver: 'd1-http', dbCredentials: { accountId, databaseId, token } }
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
