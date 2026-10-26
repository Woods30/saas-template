/**
 * 生产环境变量校验：强制以 production 语义复用 `src/env` 的 schema。
 * `VITE_BASE_URL` 必须是显式提供的真实 HTTPS 域名，已启用服务的必要字段缺失即失败。
 * 只校验本地配置，不代表 Cloudflare 云端已配置 secrets；绝不打印值。
 */
import { existsSync } from 'node:fs'
import { ZodError } from 'zod'
import { getServiceStatuses, validateWebsiteConfig } from '../src/config/service-status'
import { createWebsiteConfig } from '../src/config/website'
import { parsePublicEnv } from '../src/env/public'
import { validateProdServerEnv } from '../src/env/server'
import { resolveRawEnv } from './lib/env-file'
import { formatServiceDiagnostics, formatZodIssues } from './lib/report-issues'

/** 生产环境变量文件；存在时优先于 `.env`。 */
const PRODUCTION_ENV_PATH = '.env.production'

/**
 * `VITE_BASE_URL` 是否为可用于生产的真实 HTTPS 站点根：无凭据、非本地 / 回环、非保留示例域。
 */
function isProductionBaseUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      host !== 'localhost' &&
      !host.endsWith('.localhost') &&
      host !== '::1' &&
      host !== '0.0.0.0' &&
      !/^127\./.test(host) &&
      !['example.com', 'example.net', 'example.org'].some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      ) &&
      !host.endsWith('.example') &&
      !host.endsWith('.test')
    )
  } catch {
    return false
  }
}

function main(): void {
  // 优先读 `.env.production`，与 `vite build` 读取的是同一文件，保证校验值即打进
  // bundle 的值。文件存在时**不**回退——否则生产配置写错会被本地合法值掩盖。
  const raw = existsSync(PRODUCTION_ENV_PATH) ? resolveRawEnv(PRODUCTION_ENV_PATH) : resolveRawEnv()

  // 不信任 `.env` / 进程里的 NODE_ENV，避免本地 development 值绕过生产校验。
  const prodRaw: Record<string, string | undefined> = { ...raw, NODE_ENV: 'production' }

  // 空 / 缺省会落回 schema 默认 localhost，不能接受。
  if (!isProductionBaseUrl(raw.VITE_BASE_URL)) {
    console.error(
      '❌ VITE_BASE_URL 必须为显式提供的真实 HTTPS 生产域名（不能为空、本地、回环或保留域名）',
    )
    process.exit(1)
  }

  let publicEnv: ReturnType<typeof parsePublicEnv>
  let serverEnv: ReturnType<typeof validateProdServerEnv>
  try {
    publicEnv = parsePublicEnv(prodRaw)
    serverEnv = validateProdServerEnv(prodRaw)
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('❌ 生产环境变量校验失败：')
      for (const line of formatZodIssues(error)) console.error(`  - ${line}`)
      process.exit(1)
    }
    if (error instanceof Error) {
      console.error(`❌ 生产环境变量校验失败：${error.message}`)
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
    console.error('❌ 已启用服务缺少必要配置：')
    for (const line of diagnostics.lines) console.error(`  ${line}`)
    process.exit(1)
  }

  console.log('✅ 生产环境变量校验通过')
}

main()
