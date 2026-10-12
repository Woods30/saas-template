import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { BetterAuthPlugin } from 'better-auth'
import { betterAuth } from 'better-auth/minimal'
import { createDb, schema } from '@/db'
import { parseServerEnv } from '@/env/server'

/**
 * Better Auth v1.7.7 + Drizzle adapter（D1）。
 *
 * 关键设计：
 * 1. 走 `better-auth/minimal`（无 Node-only 依赖，专为 Workers 优化）。
 * 2. `drizzleAdapter` 来自独立包 `@better-auth/drizzle-adapter`，负责所有
 *    数据库读写；无需再设 `database:` 顶层字段（adapter 即为数据源）。
 * 3. env 从调用方注入，不读取 `process.env`，保证 SSR/client bundle 行为一致。
 * 4. re-entrant：每次调用用当次请求的 env，创建独立的 BetterAuth instance。
 */
export function getAuth(env: Env) {
  const parsed = parseServerEnv(env as unknown as Record<string, unknown>)
  const db = createDb(env.DB)

  return betterAuth({
    secret: parsed.BETTER_AUTH_SECRET,
    plugins: [
      drizzleAdapter(db, {
        provider: 'sqlite',
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }) as unknown as BetterAuthPlugin,
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
    },
    socialProviders: {
      google:
        parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
          ? {
              clientId: parsed.GOOGLE_CLIENT_ID,
              clientSecret: parsed.GOOGLE_CLIENT_SECRET,
            }
          : undefined,
    },
    user: {
      deleteUser: { enabled: true },
    },
  })
}
