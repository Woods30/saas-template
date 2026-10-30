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
 * 已创建的实例，按 D1 binding 复用。
 *
 * `getAuth` 会在每次会话校验、每个受保护 server function 里被调用。`betterAuth()`
 * 要合并配置、构建 adapter、注册插件并生成路由表——每次重建实测能让一次请求多花
 * 数百毫秒，而配置在进程内是常量。
 *
 * 键取 `env.DB`（D1 binding）而非 `env` 本身：`src/server.ts` 每个请求都会新建
 * `normalizedEnv` 对象，按它缓存永远命中不了；binding 在 isolate 内是稳定对象。
 * 用 `WeakMap` 避免持有 binding 阻止回收。
 */
/**
 * Better Auth + Drizzle adapter（D1）。
 *
 * `drizzleAdapter(...)` 必须作为顶层 `database:` 传入；放进 `plugins:` 会让
 * better-auth 静默回退到内存适配器（注册看似成功，实际不落库）。
 *
 * 实例按 D1 binding 复用（见 `getAuth`）。邮件回调统一走 `src/auth/emails.ts`
 * 且绝不抛错——better-auth 经 `runInBackgroundOrAwait` 调用它们，抛错会让注册 / 登录失败。
 */
export function createAuth(env: Env) {
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
    session: {
      /**
       * 会话 cookie 缓存。
       *
       * 开启后 `getSession` 在有效期内直接读签名 cookie，不再查 D1——会话校验是每个
       * 受保护请求的前置依赖，少一次数据库往返对响应时间影响明显。
       *
       * **代价**：cookie 里是带过期时间的签名 JWT。登出、改密码、删号会连带清除本机
       * 的缓存 cookie（立即生效）；但**跨设备撤销**只删除 D1 记录，不会通知已被踢设备
       * 手上的缓存 cookie。因此 `maxAge` 就是「设备被踢后仍可访问」的窗口。
       *
       * 这里取 30 秒而非默认的 300 秒：连续切换页面（秒级）照样命中缓存，而风险窗口
       * 压到最小。站点规模变大、撤销敏感度提高时应调小或关闭。
       */
      cookieCache: {
        enabled: true,
        maxAge: 30,
      },
    },
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
      sendOnSignIn: websiteConfig.mail.enabled && requiresEmailVerification(),
      autoSignInAfterVerification: true,
      afterEmailVerification: async (user, request) => {
        if (!websiteConfig.mail.enabled) return
        await dispatch(
          { kind: 'welcome', to: user.email, username: user.name ?? user.email },
          request,
        )
      },
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
    user: {
      deleteUser: { enabled: true },
    },
  })
}

/**
 * 已创建的实例，按 D1 binding 复用。
 *
 * 键取 `env.DB`（D1 binding）而非 `env` 本身：`src/server.ts` 每个请求都会新建
 * `normalizedEnv` 对象，按它缓存永远命中不了；binding 在 isolate 内是稳定对象。
 * 用 `WeakMap` 避免持有 binding 阻止回收。
 */
const authInstances = new WeakMap<object, ReturnType<typeof createAuth>>()

/**
 * 取当前部署的 better-auth 实例，同一 D1 binding 复用。
 *
 * `getAuth` 会在每次会话校验、每个受保护 server function 里被调用。`betterAuth()`
 * 要合并配置、构建 adapter、注册插件并生成路由表——每次重建实测能让一次请求多花
 * 数百毫秒，而配置在进程内是常量。
 */
export function getAuth(env: Env) {
  const cacheKey = env.DB as unknown as object
  const cached = authInstances.get(cacheKey)
  if (cached) return cached
  const instance = createAuth(env)
  authInstances.set(cacheKey, instance)
  return instance
}
