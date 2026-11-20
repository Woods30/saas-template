/**
 * 开发环境变量校验：只检查**启动必需**项是否合法。
 *
 * 支付 / 邮件 / 通知 / 分析的凭据已移入数据库，运行期不读 env（见 ADR-0010），
 * 所以这里无从校验它们的完整性——那是后台「系统设置」与 `getServiceStatuses`
 * 的运行期职责。绝不打印值。
 */
import { ZodError } from 'zod'
import { validateWebsiteConfig } from '../src/config/service-status'
import { createWebsiteConfig } from '../src/config/website'
import { parsePublicEnv } from '../src/core/env/public'
import { parseServerEnv } from '../src/core/env/server'
import { resolveRawEnv } from './lib/env-file'
import { formatZodIssues } from './lib/report-issues'

function main(): void {
  // `.env` 不存在时回退到进程 env（CI 场景）。
  const raw = resolveRawEnv()

  let publicEnv: ReturnType<typeof parsePublicEnv>
  try {
    publicEnv = parsePublicEnv(raw)
    parseServerEnv(raw)
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('❌ 开发环境变量校验失败：')
      for (const line of formatZodIssues(error)) console.error(`  - ${line}`)
      process.exit(1)
    }
    throw error
  }

  // 用脚本自己解析的 raw env 构造配置，避免导入 Vite 下求值的 `websiteConfig`。
  const config = createWebsiteConfig(publicEnv)

  const configIssues = validateWebsiteConfig(config)
  if (configIssues.length > 0) {
    console.error('❌ 网站配置校验失败：')
    for (const issue of configIssues) {
      console.error(`  - ${issue.key}（${issue.location}）：${issue.reason}`)
    }
    process.exit(1)
  }

  console.log('✅ 开发环境变量校验通过')
}

main()
