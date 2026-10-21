/**
 * 开发环境变量校验：复用 `src/env` 的 Zod schema 检查已提供的字段是否合法。
 * 开发允许 optional 功能未配置，因此不强制 secret；缺配置只提示。绝不打印值。
 */
import { ZodError } from 'zod'
import { getServiceStatuses, validateWebsiteConfig } from '../src/config/service-status'
import { createWebsiteConfig } from '../src/config/website'
import { parsePublicEnv } from '../src/env/public'
import { parseServerEnv } from '../src/env/server'
import { resolveRawEnv } from './lib/env-file'
import { formatServiceDiagnostics, formatZodIssues } from './lib/report-issues'

function main(): void {
  // `.env` 不存在时回退到进程 env（CI 场景）。
  const raw = resolveRawEnv()

  let publicEnv: ReturnType<typeof parsePublicEnv>
  let serverEnv: ReturnType<typeof parseServerEnv>
  try {
    publicEnv = parsePublicEnv(raw)
    serverEnv = parseServerEnv(raw)
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

  const diagnostics = formatServiceDiagnostics(getServiceStatuses({ config, publicEnv, serverEnv }))
  if (diagnostics.hasIncomplete) {
    console.log('⚠️ 以下已启用服务缺少必要配置（开发环境仅提示，公共页面仍可开发）：')
    for (const line of diagnostics.lines) console.log(`  ${line}`)
  }

  console.log('✅ 开发环境变量校验通过')
}

main()
