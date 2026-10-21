/**
 * 客户端 bundle 敏感字段校验：构建后扫描 `dist/client` 文本产物，发现真实泄露即失败。
 *
 * 只认三种泄露：字面量赋值、`import.meta.env.KEY`、`process.env.KEY`。
 * better-auth 的 `Object.freeze({get KEY(){return s("KEY")}})` 是运行时 getter，不算泄露。
 * 诊断只输出文件路径与字段名，绝不打印匹配内容（可能含真实 secret）。
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

/**
 * 剥离 better-auth 的运行时 getter `get KEY(){return s("KEY")}`。
 * backreference 强制两处 KEY 一致，真实 secret 只能出现在 `=` / `:` 之后，仍会被抓到。
 */
const BETTER_AUTH_PROXY_PATTERN =
  /get\s+([A-Z_][A-Z0-9_]*)\s*\(\s*\)\s*\{\s*return\s+s\s*\(\s*[`'"]\1[`'"]\s*\)\s*\}/g

function stripBetterAuthEnvProxy(content: string): string {
  return content.replace(BETTER_AUTH_PROXY_PATTERN, '/* env getter stripped */')
}

/** 单个 key 的三条泄露检测正则：字面量、Vite 内联、process.env。 */
interface LeakPattern {
  key: string
  literal: RegExp
  vite: RegExp
  processEnv: RegExp
}

function compilePatternsFor(key: string): LeakPattern {
  // 字段名由硬编码数组控制，仅含 `[A-Z0-9_]`，转义后注入 RegExp 模板安全。
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    key,
    literal: new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*["']`, 'g'),
    vite: new RegExp(`import\\.meta\\.env\\.${escaped}\\b`, 'g'),
    processEnv: new RegExp(`\\bprocess\\.env\\.${escaped}\\b`, 'g'),
  }
}

/** 模块加载期一次性预编译，运行期零字符串拼接。 */
const LEAK_PATTERNS: ReadonlyArray<LeakPattern> = FORBIDDEN_KEYS.map(compilePatternsFor)

/** 检测文件中的真实泄露；先剥离 better-auth getter，注释与错误消息不会命中。 */
function findLeaks(content: string): string[] {
  const stripped = stripBetterAuthEnvProxy(content)
  const leaks: string[] = []
  for (const { key, literal, vite, processEnv } of LEAK_PATTERNS) {
    if (literal.test(stripped) || vite.test(stripped) || processEnv.test(stripped)) {
      leaks.push(key)
    }
  }
  return leaks
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
    const leaks = findLeaks(content)
    if (leaks.length > 0) {
      console.error(`❌ ${file} 泄露服务端字段：${leaks.join(', ')}`)
      failed = true
    }
  }

  if (failed) process.exit(1)
  console.log(`✅ 客户端 bundle 不含敏感字段（已扫描 ${scanned.length} 个文件）`)
}

main()
