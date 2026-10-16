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
 * Better Auth v1.7.10 + Drizzle adapter（D1）。
 *
 * 关键设计：
 * 1. 走 `better-auth/minimal`（无 Node-only 依赖，专为 Workers 优化）。
 * 2. `drizzleAdapter(db, config)` 是**适配器工厂**，必须作为顶层 `database:` 传入。
 *    放进 `plugins:` 是错的：better-auth 在 `createAuthContext` 之前就调用
 *    `getBaseAdapter(options)`，而该函数只读 `options.database`——插件 `init`
 *    那时还没跑。放错位置会让 `options.database` 为 undefined，better-auth
 *    静默回退到内存适配器（注册/登录看似成功，实际不落库）。
 * 3. env 从调用方注入，不读取 `process.env`，保证 SSR/client bundle 行为一致。
 * 4. re-entrant：每次调用用当次请求的 env，创建独立的 BetterAuth instance。
 * 5. 邮件回调（验证 / 重置 / 欢迎）统一走 `src/auth/emails.ts`，该模块内部捕获所有
 *    异常——better-auth 用 `runInBackgroundOrAwait` 调用它们，回调抛错会让**注册 /
 *    登录失败**，因此邮件问题绝不能冒泡。
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
    // 显式传入站点根地址，避免 better-auth 从请求 origin 推断时打印
    // `Base URL is not set` 警告，并让回调 / 重定向地址在多域名部署下保持稳定。
    // 未配置时传 `undefined`，better-auth 退回请求 origin（单域名部署等价）。
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
    // admin 用默认配置即可：defaultRole 'user'、adminRoles ['admin']，与本仓
    // `users.role` 的取值一致，无需 options。
    plugins: [apiKey({ defaultPrefix: 'key_' }), admin()],
    emailAndPassword: {
      enabled: true,
      // 安全控制，读显式配置（`auth.requireEmailVerification`），**不**随 `mail.enabled`
      // 隐式降级——邮箱在下游是身份依据，允许未验证邮箱登录等于允许冒用他人地址。
      // 该字段默认 false 仅为让未接邮件的模板开箱可用；接上邮件后应改为 true，
      // 且「true + 邮件未配齐」会被 check:env:prod 拦下（矛盾配置）。
      // 注册页的去向判定读同一份定义（`src/auth/flow.ts`），两侧不会分歧。
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
      // 与 `requireEmailVerification` 当前取值相同，但概念不同：这里问的是「要不要发验证
      // 邮件」（取决于邮件是否可用），上面问的是「不发验证邮件时能否登录」。分开写，
      // 将来只放开其中一个时不必再拆。
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
            // 欢迎邮件与验证邮件解耦：邮件关闭时整体跳过（`dispatch` 也会再兜一层）。
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
