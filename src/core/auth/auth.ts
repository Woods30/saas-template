import { apiKey } from '@better-auth/api-key'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins/admin'
import { websiteConfig } from '@/config/website'
import { sendAuthEmailForRequest } from '@/core/auth/emails'
import { requiresEmailVerification } from '@/core/auth/flow'
import { createDbFromEnv, schema } from '@/core/db'
import { isPostgresDialect, resolveDatabaseProvider } from '@/core/db/provider'
import { getRequestScoped } from '@/core/db/request-scope'
import { sendMail } from '@/core/email'
import { parseServerEnv, type RuntimeEnv } from '@/core/env/server'
import { readAttribution } from '@/lib/attribution'

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
 * 实例按 D1 binding 复用（见 `getAuth`）。邮件回调统一走 `src/core/auth/emails.ts`
 * 且绝不抛错——better-auth 经 `runInBackgroundOrAwait` 调用它们，抛错会让注册 / 登录失败。
 *
 * 异步：数据库连接按 provider 异步建立（驱动按需加载），故实例也是 Promise。
 */
export async function createAuth(env: Env) {
  const parsed = parseServerEnv(env as unknown as Record<string, unknown>)
  const db = await createDbFromEnv(env)
  // 托管凭据（OAuth 等）来自数据库配置，由 `server.ts` 合进每请求 env。
  const runtime = env as unknown as RuntimeEnv
  const deps = { sendMail, config: websiteConfig, serverEnv: runtime }

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
      // 适配器的 provider 必须跟 schema 方言一致：生成物按 DATABASE_PROVIDER 产出，
      // 写死 'sqlite' 会让 PostgreSQL 部署生成 SQLite 方言的 SQL。
      provider: isPostgresDialect(schema.SCHEMA_DIALECT) ? 'pg' : 'sqlite',
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
        runtime.GOOGLE_CLIENT_ID && runtime.GOOGLE_CLIENT_SECRET
          ? {
              clientId: runtime.GOOGLE_CLIENT_ID,
              clientSecret: runtime.GOOGLE_CLIENT_SECRET,
            }
          : undefined,
    },
    user: {
      deleteUser: { enabled: true },
      /**
       * 首次触达归因列。`input: false` 让 better-auth 拒绝客户端请求体里的同名字段——
       * 归因只能由下面的 create 钩子从请求 cookie / 请求头写入。
       */
      additionalFields: {
        utmSource: { type: 'string', required: false, defaultValue: '', input: false },
        utmMedium: { type: 'string', required: false, defaultValue: '', input: false },
        utmCampaign: { type: 'string', required: false, defaultValue: '', input: false },
        utmTerm: { type: 'string', required: false, defaultValue: '', input: false },
        utmContent: { type: 'string', required: false, defaultValue: '', input: false },
        referrer: { type: 'string', required: false, defaultValue: '', input: false },
        country: { type: 'string', required: false, defaultValue: '', input: false },
        ip: { type: 'string', required: false, defaultValue: '', input: false },
        locale: { type: 'string', required: false, defaultValue: '', input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          /**
           * 归因只写一次：只在 create 前合并，之后的 update 不会覆盖。
           * `ctx` 为 null（服务端直接调用 / 测试）或没有 headers 时回退空值，不抛错。
           */
          before: async (user, ctx) => ({
            data: { ...user, ...readAttribution(ctx?.headers ?? new Headers()) },
          }),
        },
      },
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
 * 取当前部署的 better-auth 实例。
 *
 * - D1 / SQLite：按 D1 binding 复用。`getAuth` 会在每次会话校验、每个受保护
 *   server function 里被调用，`betterAuth()` 要合并配置、构建 adapter、注册插件并
 *   生成路由表——每次重建实测能让一次请求多花数百毫秒，而配置在进程内是常量。
 *   binding 在 isolate 内是稳定对象，`src/server.ts` 每请求新建的 `normalizedEnv`
 *   不是，所以键取 binding。
 * - PostgreSQL：按请求作用域复用。Workers 的 isolate 可能在请求之间被冻结，
 *   跨请求复用的 TCP 连接会失效，因此实例挂在请求作用域上，请求结束即丢弃。
 *
 * 异步：实例是 Promise（数据库连接异步建立），缓存里存的也是同一个 Promise，
 * 并发调用共享同一次建连。
 */
export async function getAuth(env: Env) {
  const provider = resolveDatabaseProvider(env.DATABASE_PROVIDER)
  if (provider === 'postgres') {
    const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_PROVIDER=postgres 需要 DATABASE_URL 或 Hyperdrive binding')
    }
    return getRequestScoped(`postgres:auth:${url}`, () => createAuth(env))
  }

  const cacheKey = env.DB as unknown as object
  const cached = authInstances.get(cacheKey)
  if (cached) return cached
  const instance = createAuth(env)
  authInstances.set(cacheKey, instance)
  return instance
}
