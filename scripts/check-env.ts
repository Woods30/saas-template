/**
 * 开发环境变量校验。
 *
 * 复用 `src/env` 的两套 Zod schema，校验 `.env` 中**已提供**的字段是否合法：
 * - 公开变量（`VITE_*`）：非法 URL、非法 enum 会失败；
 * - 服务端变量：已提供但过短 / 非法 URL 会失败。
 *
 * 开发允许 optional 功能未配置（如未填 Stripe、Analytics），因此这里不强制任何 secret。
 * 诊断只输出变量名与原因，绝不打印值或 `.env` 内容。
 */
import { ZodError } from 'zod'
import { parsePublicEnv } from '../src/env/public'
import { parseServerEnv } from '../src/env/server'
import { resolveRawEnv } from './lib/env-file'
import { formatZodIssues } from './lib/report-issues'

function main(): void {
  // Try to resolve .env; if it doesn't exist, exit immediately.
  const raw = (() => {
    try {
      return resolveRawEnv()
    } catch {
      console.error('❌ 未找到 .env。复制模板后重试：cp .env.example .env')
      process.exit(1)
    }
  })()

  try {
    parsePublicEnv(raw)
    parseServerEnv(raw)
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('❌ 开发环境变量校验失败：')
      for (const line of formatZodIssues(error)) console.error(`  - ${line}`)
      process.exit(1)
    }
    throw error
  }

  console.log('✅ 开发环境变量校验通过')
}

main()
