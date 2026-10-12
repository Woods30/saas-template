import { z } from 'zod'

const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']).optional(),
  VITE_STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  VITE_STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  VITE_STRIPE_PRICE_LIFETIME: z.string().optional(),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_ID: z.string().optional(),
  VITE_CLARITY_ID: z.string().optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
})

export type PublicEnv = z.infer<typeof schema>

export function parsePublicEnv(raw: unknown): PublicEnv {
  return schema.parse(raw)
}

/**
 * 解析后的公开环境变量，供 `src/config/*`、`src/lib/*` 等消费。
 *
 * 这里是读取 `import.meta.env` 的唯一边界（Vite 在 SSR 与客户端均注入该对象），
 * 业务代码不得直接读取 `import.meta.env` / `process.env`，一律经由此导出。
 * 模块加载期即校验：非法 `VITE_BASE_URL` 会让导入方直接抛错，避免带着坏配置继续运行。
 */
export const publicEnv: PublicEnv = parsePublicEnv(import.meta.env)
