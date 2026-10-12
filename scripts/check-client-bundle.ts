/**
 * 客户端 bundle 敏感字段校验。
 *
 * 构建后递归扫描 `dist/client` 的文本产物，若出现任何服务端 secret 的**字段名**即失败，
 * 防止 secret 被误打进客户端 bundle（`VITE_` 变量会公开暴露）。
 *
 * 设计要点：
 * - 不导入 `src/env/server.ts` 的 schema（避免把服务端模块带进构建图），此处显式维护
 *   需要拦截的字段名清单，与 `src/env/server.ts` 的服务端字段保持同步；
 * - 必须存在真实产物（至少一个 `.js` / `.html`），空目录视为失败，避免「没构建也通过」；
 * - 诊断只输出文件路径与字段名，绝不打印匹配到的内容（可能含真实 secret）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'dist/client'

/** 会被打包进客户端、需要拦截的服务端字段名（与 `src/env/server.ts` 同步）。 */
const FORBIDDEN_KEYS = [
  'BETTER_AUTH_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_EMAIL_SENDER',
  'RESEND_API_KEY',
  'RESEND_AUDIENCE_ID',
  'BEEHIIV_API_KEY',
  'BEEHIIV_PUBLICATION_ID',
  'DISCORD_WEBHOOK_URL',
  'FEISHU_WEBHOOK_URL',
  'TURNSTILE_SECRET_KEY',
] as const

/** 会被扫描的文本产物扩展名。 */
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.html', '.json', '.map', '.css'] as const

function hasScannableExtension(file: string): boolean {
  return SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext))
}

/** 递归收集目录下所有文件。 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function main(): void {
  if (!statSync(TARGET, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`❌ 目录 ${TARGET} 不存在，请先运行 pnpm build`)
    process.exit(1)
  }

  const files = walk(TARGET)
  const scanned = files.filter(hasScannableExtension)
  const hasRealAsset = scanned.some((file) => file.endsWith('.js') || file.endsWith('.html'))

  if (scanned.length === 0 || !hasRealAsset) {
    console.error(`❌ ${TARGET} 没有可扫描的 js/html 产物，疑似构建缺失，请重新运行 pnpm build`)
    process.exit(1)
  }

  let failed = false
  for (const file of scanned) {
    const content = readFileSync(file, 'utf-8')
    for (const key of FORBIDDEN_KEYS) {
      if (content.includes(key)) {
        console.error(`❌ ${file} 含服务端字段名 ${key}`)
        failed = true
      }
    }
  }

  if (failed) process.exit(1)
  console.log(`✅ 客户端 bundle 不含敏感字段（已扫描 ${scanned.length} 个文件）`)
}

main()
