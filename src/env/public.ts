import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']).optional(),
  /**
   * Stripe Price 的 `lookup_key`，不是 Price ID。
   *
   * 官方推荐用它做「页面展示价 ↔ 实际扣款价」的锚点：换价时把 key 迁到新 Price 上
   * （`transfer_lookup_key=true`），页面与代码都不用动。Price ID 一换就得改代码重新
   * 部署，且极易与后台配置漂移。
   */
  VITE_STRIPE_LOOKUP_PRO_MONTHLY: z.string().optional(),
  VITE_STRIPE_LOOKUP_PRO_YEARLY: z.string().optional(),
  VITE_STRIPE_LOOKUP_LIFETIME: z.string().optional(),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_WEBSITE_ID: z.string().optional(),
  VITE_UMAMI_ID: z.string().optional(),
  VITE_UMAMI_SCRIPT_URL: z
    .url()
    .refine(
      (value) => {
        try {
          const url = new URL(value)
          return url.protocol === 'https:' && !url.username && !url.password
        } catch {
          return false
        }
      },
      { message: 'VITE_UMAMI_SCRIPT_URL 必须为无凭据的 HTTPS URL' },
    )
    .optional(),
  VITE_CLARITY_PROJECT_ID: z.string().optional(),
  VITE_CLARITY_ID: z.string().optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
})

export type PublicEnv = z.infer<typeof schema>

export function parsePublicEnv(raw: unknown): PublicEnv {
  return schema.parse(treatEmptyAsUndefined(raw))
}

/**
 * 解析后的公开环境变量，供 `src/config/*`、`src/lib/*` 等消费。
 *
 * 这里是读取 `import.meta.env` 的唯一边界：业务代码不得直接读 `import.meta.env` /
 * `process.env`。`VITE_` 前缀的值会进客户端 bundle，**不得放任何 secret**。
 *
 * `?? {}` 兜底非 Vite 运行时（tsx 脚本、单测），让校验退回默认值而非加载期抛错。
 */
export const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})
