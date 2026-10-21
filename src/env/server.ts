import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET 必须 ≥ 32 字符').optional(),
  /**
   * Better Auth 的站点根地址，用于生成回调与重定向的**绝对** URL。
   *
   * 未设时从请求 origin 推断，单域名部署等价；**多域名或接了 OAuth / 邮件验证时必须
   * 显式设置**，否则回调地址随请求漂移。
   *
   * 服务端字段而非 `VITE_` 公开值：只参与服务端生成链接，不进客户端 bundle。
   */
  BETTER_AUTH_URL: z.url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_EMAIL_SENDER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.email().optional(),
  RESEND_AUDIENCE_ID: z.string().optional(),
  BEEHIIV_API_KEY: z.string().optional(),
  BEEHIIV_PUBLICATION_ID: z.string().optional(),
  BEEHIIV_SEND_WELCOME_EMAIL: z.enum(['true', 'false']).default('false').optional(),
  DISCORD_WEBHOOK_URL: z
    .url()
    .refine((u) => u.startsWith('https://discord.com/api/webhooks/'), {
      message: 'Discord webhook URL must start with https://discord.com/api/webhooks/',
    })
    .optional(),
  FEISHU_WEBHOOK_URL: z
    .url()
    .refine((u) => u.startsWith('https://open.feishu.cn/open-apis/bot/v2/hook/'), {
      message: 'Feishu webhook URL must start with https://open.feishu.cn/open-apis/bot/v2/hook/',
    })
    .optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type ServerEnv = z.infer<typeof schema>

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
