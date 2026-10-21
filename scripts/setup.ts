#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { confirm, input, password, select } from '@inquirer/prompts'

function run(cmd: string, options: { stdio?: 'inherit' | 'pipe' } = {}) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: options.stdio ?? 'inherit' })
}

export function readEnv(): Record<string, string> {
  if (!existsSync('.env')) return {}
  const raw = readFileSync('.env', 'utf-8')
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) {
      const key = m[1]
      const value = m[2]
      if (key !== undefined && value !== undefined) {
        result[key] = value
      }
    }
  }
  return result
}

export function writeEnv(env: Record<string, string>) {
  const content = `${Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')}\n`
  writeFileSync('.env', content)
  console.log('✅ .env 已更新')
}

async function main() {
  console.log('🚀 SaaS Template Setup\n')

  // wrangler 未登录只软警告，不阻断。
  try {
    const out = run('wrangler whoami', { stdio: 'pipe' }).toString()
    const m = out.match(/associated with the email (.+?)[\n"]/)
    if (m) {
      console.log(`✅ wrangler 已登录：${m[1]}`)
    }
  } catch {
    console.warn('⚠️  wrangler 未登录（将继续；wrangler 命令可能失败）')
  }

  const projectName = await input({
    message: '项目名（用于 Cloudflare 资源前缀）',
    default: 'saas-template',
    validate: (v) => /^[a-z0-9-]+$/.test(v) || '仅允许小写字母、数字、连字符',
  })
  const dbName = `${projectName}-db`
  const r2Name = `${projectName}-uploads`
  const kvName = `${projectName}-cache`

  let dbId = ''
  try {
    const out = run(`wrangler d1 create ${dbName} --json`, { stdio: 'pipe' }).toString()
    dbId = (JSON.parse(out) as { uuid: string }).uuid
  } catch {
    // 已存在时从 d1 list 解析 id。
    try {
      const list = run(`wrangler d1 list --json`, { stdio: 'pipe' }).toString()
      const found = (JSON.parse(list) as Array<{ uuid: string; name: string }>).find(
        (d) => d.name === dbName,
      )
      if (!found) throw new Error('无法解析已存在的 D1 id')
      dbId = found.uuid
      console.log(`✅ D1 已存在：${dbId}`)
    } catch (e) {
      throw new Error(`D1 创建/查找失败：${(e as Error).message}`)
    }
  }
  console.log(`✅ D1：${dbId}`)

  try {
    run(`wrangler r2 bucket create ${r2Name}`)
  } catch {
    console.log(`✅ R2 bucket ${r2Name}（可能已存在）`)
  }

  let kvId = ''
  try {
    const out = run(`wrangler kv namespace create ${kvName}`, { stdio: 'pipe' }).toString()
    const m = out.match(/id = "([a-f0-9]+)"/)
    if (!m) throw new Error('无法解析 KV id')
    const kvIdMatch = m[1]
    if (!kvIdMatch) throw new Error('无法解析 KV id')
    kvId = kvIdMatch
  } catch {
    try {
      const list = run(`wrangler kv namespace list --json`, { stdio: 'pipe' }).toString()
      const found = (JSON.parse(list) as Array<{ id: string; title: string }>).find(
        (k) => k.title === kvName,
      )
      if (!found) throw new Error('无法解析已存在的 KV id')
      kvId = found.id
      console.log(`✅ KV 已存在：${kvId}`)
    } catch (e) {
      throw new Error(`KV 创建/查找失败：${(e as Error).message}`)
    }
  }
  console.log(`✅ KV：${kvId}`)

  const authSecret = randomBytes(32).toString('base64')

  const env = readEnv()

  const stripeChoice = await select({
    message: 'Stripe 配置？',
    choices: [
      { name: 'skip', value: 'skip' },
      { name: 'configure', value: 'configure' },
    ],
  })
  if (stripeChoice === 'configure') {
    env.VITE_PAYMENT_PROVIDER = 'stripe'
    env.STRIPE_SECRET_KEY = await password({ message: 'STRIPE_SECRET_KEY' })
    env.STRIPE_WEBHOOK_SECRET = await password({ message: 'STRIPE_WEBHOOK_SECRET' })
    env.VITE_STRIPE_PRICE_PRO_MONTHLY = await input({ message: 'VITE_STRIPE_PRICE_PRO_MONTHLY' })
    env.VITE_STRIPE_PRICE_PRO_YEARLY = await input({ message: 'VITE_STRIPE_PRICE_PRO_YEARLY' })
    env.VITE_STRIPE_PRICE_LIFETIME = await input({ message: 'VITE_STRIPE_PRICE_LIFETIME' })
  }

  const mailProvider = await select({
    message: '邮件 provider？',
    choices: [
      { name: 'cloudflare', value: 'cloudflare' },
      { name: 'resend', value: 'resend' },
      { name: 'skip', value: 'skip' },
    ],
  })
  if (mailProvider === 'cloudflare') {
    env.CLOUDFLARE_ACCOUNT_ID = await input({ message: 'CLOUDFLARE_ACCOUNT_ID' })
    env.CLOUDFLARE_API_TOKEN = await password({ message: 'CLOUDFLARE_API_TOKEN' })
    env.CLOUDFLARE_EMAIL_SENDER = await input({
      message: 'CLOUDFLARE_EMAIL_SENDER (e.g. support@example.com)',
      default: `support@${projectName}.com`,
    })
  } else if (mailProvider === 'resend') {
    env.RESEND_API_KEY = await password({ message: 'RESEND_API_KEY' })
  }

  const enableDiscord = await confirm({ message: '启用 Discord 通知？', default: false })
  if (enableDiscord) {
    env.DISCORD_WEBHOOK_URL = await input({ message: 'DISCORD_WEBHOOK_URL' })
  }

  env.CLOUDFLARE_DATABASE_ID = dbId
  env.BETTER_AUTH_SECRET = authSecret
  if (!existsSync('.env')) {
    if (existsSync('.env.example')) {
      execSync('cp .env.example .env')
    } else {
      throw new Error('缺少 .env 与 .env.example；请先创建 .env.example')
    }
  }
  writeEnv(env)

  const wranglerRaw = readFileSync('wrangler.jsonc', 'utf-8')
  // 剥离 JSONC 注释后解析再写回：字段保留，注释会丢失。
  const stripped = wranglerRaw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const wrangler = JSON.parse(stripped) as Record<string, unknown>

  wrangler.d1_databases = [
    {
      binding: 'DB',
      database_name: dbName,
      database_id: dbId,
      migrations_dir: './src/db/migrations',
    },
  ]
  wrangler.r2_buckets = [{ binding: 'BUCKET', bucket_name: r2Name }]
  wrangler.kv_namespaces = [{ binding: 'CACHE', id: kvId }]

  writeFileSync('wrangler.jsonc', `${JSON.stringify(wrangler, null, 2)}\n`)
  console.log('✅ wrangler.jsonc 已更新')

  try {
    run('pnpm exec wrangler d1 migrations apply DB --local')
  } catch (e) {
    console.warn(`⚠️  本地迁移失败：${(e as Error).message.split('\n')[0]}`)
  }

  console.log('\n✅ Setup 完成。下一步：')
  console.log('  pnpm dev    启动开发服务器')
  console.log('  pnpm deploy 部署到 Cloudflare')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
