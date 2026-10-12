import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET 必须 ≥ 32 字符').optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_EMAIL_SENDER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_AUDIENCE_ID: z.string().optional(),
  BEEHIIV_API_KEY: z.string().optional(),
  BEEHIIV_PUBLICATION_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.url().optional(),
  FEISHU_WEBHOOK_URL: z.url().optional(),
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
