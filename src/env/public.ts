import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe', 'creem']).optional(),
  /**
   * 新订单走哪条结账链路：`provider` 走托管支付渠道，`collection` 走收款码核销。
   *
   * 缺省是 `provider`；两条链路互斥，同一时刻只有一条收新订单。
   */
  VITE_CHECKOUT_MODE: z.enum(['provider', 'collection']).optional(),
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
  /**
   * 逗号分隔的模块白名单，覆盖 `website.ts` 里的模块开关。
   *
   * 同一份代码要发到不同场景（文档站只开文档，业务站开支付与邮件），
   * 开关写在代码里就没法让一个构建产物发两处。缺省时沿用代码里的默认值。
   */
  VITE_MODULES: z.string().optional(),
  /** 逗号分隔的能力开关白名单，语义同 `VITE_MODULES`。 */
  VITE_FEATURES: z.string().optional(),
  /**
   * 本仓就是文档站：根路径直接进文档首页，而不是营销首页。
   *
   * 文档站部署在独立域时，访客来的是文档；把营销首页放在根路径会让人以为
   * 走错了地方。
   */
  VITE_DOCS_AS_HOME: z.enum(['true', 'false']).optional(),
  /**
   * 核销型支付的收款账户清单（JSON 数组），覆盖 `website.ts` 里的源码兜底。
   *
   * 只在部署平台配置变量、不碰源码也能配收款账户。形状校验在
   * `applyEnvOverrides()` 里做：非法值整体忽略回退源码配置，由服务状态检查把
   * 「没有可用账户」如实报出来，而不是让坏配置静默生效。
   */
  VITE_COLLECTION_ACCOUNTS: z.string().optional(),
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
