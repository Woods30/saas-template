import { z } from 'zod'
import { treatEmptyAsUndefined } from './normalize'

/**
 * 公开构建变量。
 *
 * 只剩站点根地址：品牌、模块开关、渠道选择与分析标识都搬进了数据库配置，随页面
 * 序列化下发（`WebsiteConfig`），不再走构建期常量。`VITE_` 前缀 = 公开，**不得**
 * 存放 secret。
 */
const schema = z.object({
  VITE_BASE_URL: z.url().default('http://localhost:3000'),
})

export type PublicEnv = z.infer<typeof schema>

export function parsePublicEnv(raw: unknown): PublicEnv {
  return schema.parse(treatEmptyAsUndefined(raw))
}

/**
 * 解析后的公开环境变量，供 `src/config/*`、`src/lib/*` 等消费。
 *
 * 这里是读取 `import.meta.env` 的唯一边界：业务代码不得直接读 `import.meta.env` /
 * `process.env`。
 */
export const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})
