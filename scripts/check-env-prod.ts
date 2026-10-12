/**
 * 生产环境变量校验。
 *
 * 强制以 production 语义校验（忽略 `.env` 与进程中的 `NODE_ENV`），复用 `src/env` 的 schema：
 * - 已提供的字段须合法（URL / enum / secret 长度）；
 * - `BETTER_AUTH_SECRET` 必填且 ≥ 32 字符（见 `validateProdServerEnv`）。
 *
 * 仅校验本地配置，不代表 Cloudflare 云端已配置 secrets。诊断只输出变量名与原因，绝不打印值。
 */
import { ZodError } from 'zod'
import { parsePublicEnv } from '../src/env/public'
import { validateProdServerEnv } from '../src/env/server'
import { resolveRawEnv } from './lib/env-file'
import { formatZodIssues } from './lib/report-issues'

function main(): void {
  let raw: Record<string, string | undefined>
  try {
    raw = resolveRawEnv()
  } catch {
    console.error('❌ 未找到 .env。复制模板后重试：cp .env.example .env')
    process.exit(1)
  }

  // 强制 production：不信任 `.env` / 进程里的 NODE_ENV，避免本地 development 值绕过生产校验。
  const prodRaw: Record<string, string | undefined> = { ...raw, NODE_ENV: 'production' }

  try {
    parsePublicEnv(prodRaw)
    validateProdServerEnv(prodRaw)
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

  console.log('✅ 生产环境变量校验通过')
}

main()
