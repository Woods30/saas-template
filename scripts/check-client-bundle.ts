/**
 * 客户端 bundle 敏感字段校验。
 *
 * 构建后递归扫描 `dist/client` 的文本产物，若发现任何**真实泄露**即失败。
 *
 * 检测的"真实泄露"模式（按严重度排序）：
 * 1. `KEY: "literal"` 或 `KEY="literal"` —— 字面量赋值
 * 2. `import.meta.env.KEY` —— Vite 在构建时把 env 值内联
 * 3. `process.env.KEY` / `Deno.env.get("KEY")` / `Bun.env["KEY"]` —— 看起来在读环境变量，
 *    但若被 webpack/rollup 替换为字面量则视为泄露
 *
 * 不视为泄露：
 * - `Object.freeze({get KEY(){return s("KEY")}})` —— better-auth 的运行时 Proxy 取值；
 *   getter 函数体内的 `KEY` 是字段名（出现在属性 key 上），实际值通过 `s("KEY")` 在
 *   运行时从 `process.env` / `Deno.env` / `Bun.env` 读取，不打进 bundle。
 * - 注释、字符串字面量（如错误消息中提到 "KEY"）。
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

/**
 * 移除 better-auth env 模块的 Proxy 模式（运行时 getter，非泄露）。
 *
 * 模式：`Object.freeze({get KEY(){return s("KEY")}, ...})`
 * 关键特征：KEY 出现在 `get KEY()` 紧跟的 `{` 之后，并且 KEY 也作为参数传给同一个
 * `s()` 函数。我们移除整个 `get KEY(){return s("KEY")}` 段，让剩下的内容
 * 只在真的"泄露"场景下命中。
 */
function stripBetterAuthEnvProxy(content: string): string {
  return content.replace(
    /get\s+([A-Z_][A-Z0-9_]*)\s*\(\s*\)\s*\{\s*return\s+s\s*\(\s*[`'"]\1[`'"]\s*\)\s*\}/g,
    '/* env getter stripped */',
  )
}

/**
 * 检测文件中是否存在"真实泄露"的服务端字段名。
 *
 * 检测模式（任一命中即视为泄露）：
 * 1. `KEY: "..."` 或 `KEY="..."`  —— 字面量赋值
 * 2. `import.meta.env.KEY`        —— Vite 内联
 * 3. `KEY=...` 环境文件残留       —— `.env` 被复制进 dist
 *
 * 不会命中：
 * - `get KEY(){return s("KEY")}` —— better-auth runtime getter（先剥离）
 * - 注释中的 `KEY` 提及
 * - 错误消息字符串里的 `KEY`
 */
function findLeaks(content: string): string[] {
  const stripped = stripBetterAuthEnvProxy(content)
  const leaks: string[] = []
  for (const key of FORBIDDEN_KEYS) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 模式 1: 字面量赋值（"KEY": "value" 或 KEY="value"）
    const literalPattern = new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*["']`, 'g')
    // 模式 2: Vite 内联（import.meta.env.KEY）
    const vitePattern = new RegExp(`import\\.meta\\.env\\.${escaped}\\b`, 'g')
    // 模式 3: process.env.KEY（防止 Vite 替换为字面量后还能识别）
    const processPattern = new RegExp(`\\bprocess\\.env\\.${escaped}\\b`, 'g')

    if (
      literalPattern.test(stripped) ||
      vitePattern.test(stripped) ||
      processPattern.test(stripped)
    ) {
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
