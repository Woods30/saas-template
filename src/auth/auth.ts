import { apiKey } from '@better-auth/api-key'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins/admin'
import { sendAuthEmailForRequest } from '@/auth/emails'
import { requiresEmailVerification } from '@/auth/flow'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { parseServerEnv } from '@/env/server'
import { sendMail } from '@/mail'

/**
 * Better Auth + Drizzle adapter（D1）。
 *
 * `drizzleAdapter(...)` 必须作为顶层 `database:` 传入；放进 `plugins:` 会让
 * better-auth 静默回退到内存适配器（注册看似成功，实际不落库）。
 *
 * env 由调用方注入，每次调用创建独立实例。邮件回调统一走 `src/auth/emails.ts`
 * 且绝不抛错——better-auth 经 `runInBackgroundOrAwait` 调用它们，抛错会让注册 / 登录失败。
 */
export function getAuth(env: Env) {
  const parsed = parseServerEnv(env as unknown as Record<string, unknown>)
  const db = createDb(env.DB)
  const deps = { sendMail, config: websiteConfig, serverEnv: parsed }

  /** 邮件失败只记日志：注册 / 登录不应因 SMTP / API 故障而失败。 */
  async function dispatch(
    input: Parameters<typeof sendAuthEmailForRequest>[0],
    request: Request | undefined,
  ) {
    const result = await sendAuthEmailForRequest(input, request, deps)
    if (!result.ok) {
      console.warn(`[auth] ${input.kind} 邮件发送失败: ${result.error ?? 'unknown'}`)
    }
  }

  return betterAuth({
    secret: parsed.BETTER_AUTH_SECRET,
    // 未配置时传 `undefined`，better-auth 退回请求 origin。
    baseURL: parsed.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        // apiKey 插件的表必须显式登记：adapter 经 `config.schema[model]` 解析模型名，
        // 漏登记会在运行时「找不到 apikey 表」。
        apikey: schema.apikey,
      },
    }),
    plugins: [apiKey({ defaultPrefix: 'key_' }), admin()],
    emailAndPassword: {
      enabled: true,
      // 读显式配置，不随 `mail.enabled` 隐式降级：邮箱在下游是身份依据。
      requireEmailVerification: requiresEmailVerification(),
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }, request) => {
        await dispatch(
          {
            kind: 'forgotPassword',
            to: user.email,
            username: user.name ?? user.email,
            actionUrl: url,
          },
          request,
        )
      },
    },
    emailVerification: {
      // 概念与上面的 `requireEmailVerification` 不同：这里问的是「要不要发验证邮件」。
      sendOnSignUp: websiteConfig.mail.enabled,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        await dispatch(
          {
            kind: 'verifyEmail',
            to: user.email,
            username: user.name ?? user.email,
            actionUrl: url,
          },
          request,
        )
      },
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
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            // 欢迎邮件与验证邮件解耦：邮件关闭时整体跳过。
            if (!websiteConfig.mail.enabled) return
            await dispatch(
              { kind: 'welcome', to: user.email, username: user.name ?? user.email },
              context?.request,
            )
          },
        },
      },
    },
    user: {
      deleteUser: { enabled: true },
    },
  })
}
