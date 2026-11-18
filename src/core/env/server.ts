import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

/**
 * 启动必需的部署环境变量。
 *
 * 只放「没有它站点起不来，或会把自己锁在门外」的项。业务配置（支付 / 邮件 / 存储 /
 * 分析凭据）一律在数据库里，由 `pnpm db:seed` 从同一份环境抄进去，运行期只读数据库。
 * 见 `docs/adr/0010-settings-in-database.md`。
 */
const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET 必须 ≥ 32 字符').optional(),
  /**
   * 数据库 provider：`sqlite`（默认）/ `d1` / `postgres`。
   *
   * 决定两件事：运行时连什么库，以及**构建期生成哪份 schema**
   * （`pnpm db:setup` 按它复制手写 schema 成生成物）。改了它必须重新跑
   * `pnpm db:setup`，否则运行期会因方言不匹配直接报错。
   */
  DATABASE_PROVIDER: z.enum(['sqlite', 'd1', 'postgres']).optional(),
  /**
   * PostgreSQL 连接串（`DATABASE_PROVIDER=postgres` 时必填）。
   *
   * 跑在 Workers 上时可改用 Hyperdrive binding——那条路径不经过本变量。
   */
  DATABASE_URL: z.string().optional(),
  /**
   * Better Auth 的站点根地址，用于生成回调与重定向的**绝对** URL。
   *
   * 未设时从请求 origin 推断，单域名部署等价；**多域名或接了 OAuth / 邮件验证时必须
   * 显式设置**，否则回调地址随请求漂移。
   */
  BETTER_AUTH_URL: z.url().optional(),
  /**
   * 配置密钥的加密口令：`settings` 表里 `enc:v1:` 密文由它派生 AES-GCM 密钥。
   *
   * 必须与数据库分开保管；丢失等于所有已存凭据不可解，只能重填。缺失时后台
   * 拒绝保存含密钥的配置组，公开参数仍可写。
   */
  CONFIG_ENCRYPTION_KEY: z.string().min(16).optional(),
  /** Cloudflare 部署 token：只给 CI / 脚本用，运行期不读。 */
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  /** 管理员邮箱白名单，逗号分隔：发信接口的收件人校验。 */
  ADMIN_EMAILS: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type ServerEnv = z.infer<typeof schema>

/**
 * 由**数据库配置**派生的服务凭据形状。
 *
 * 键名沿用环境变量的名字，是为了让支付 / 邮件 / 通知的消费方不必区分来源；
 * 值来自 `core/config/derive.ts`，不是部署环境。
 */
export interface ManagedEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  CREEM_API_KEY?: string
  CREEM_WEBHOOK_SECRET?: string
  CREEM_PRODUCTS?: string
  CREEM_DEBUG?: 'true' | 'false'
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  TURNSTILE_SECRET_KEY?: string
  CLOUDFLARE_EMAIL_SENDER?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  RESEND_AUDIENCE_ID?: string
  BEEHIIV_API_KEY?: string
  BEEHIIV_PUBLICATION_ID?: string
  BEEHIIV_SEND_WELCOME_EMAIL?: 'true' | 'false'
  DISCORD_WEBHOOK_URL?: string
  FEISHU_WEBHOOK_URL?: string
}

/** 服务端消费方拿到的完整 env 形状：启动参数 + 数据库配置。 */
export type RuntimeEnv = ServerEnv & ManagedEnv

export function parseServerEnv(raw: unknown): ServerEnv {
  return schema.parse(treatEmptyAsUndefined(raw))
}

export function validateProdServerEnv(raw: unknown): ServerEnv {
  const env = schema.parse(treatEmptyAsUndefined(raw))
  if (env.NODE_ENV === 'production') {
    if (!env.BETTER_AUTH_SECRET) {
      throw new Error('生产环境必须设置 BETTER_AUTH_SECRET')
    }
  }
  return env
}
