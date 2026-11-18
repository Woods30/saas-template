#!/usr/bin/env tsx
import { execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { confirm, input, password, select } from '@inquirer/prompts'
import { prepareEnvFile, writeEnvFile } from './lib/env-file'
import { updateEnv } from './lib/env-merge'
import { buildEnvUpdates } from './lib/setup-env'
import {
  applyResourceBindings,
  isValidProjectName,
  provisionResources,
} from './lib/setup-resources'

function run(cmd: string, options: { stdio?: 'inherit' | 'pipe' } = {}) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: options.stdio ?? 'inherit' })
}

export async function main() {
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
    validate: (v) =>
      isValidProjectName(v) || '仅允许小写字母、数字、连字符（不能以连字符开头或结尾）',
  })
  const resources = provisionResources(projectName, (command, args) => {
    console.log(`$ ${command} ${args.join(' ')}`)
    // 以 argv 下发，不经 shell：项目名即使被篡改也不会被解释成命令。
    return execFileSync(command, args, { stdio: 'pipe' }).toString()
  })
  console.log(`✅ D1：${resources.dbId}`)
  console.log(`✅ KV：${resources.kvId}`)

  const authSecret = randomBytes(32).toString('base64')

  const optional: Record<string, string> = {}

  const paymentProvider = await select({
    message: '支付渠道？',
    choices: [
      { name: 'stripe', value: 'stripe' },
      { name: 'creem', value: 'creem' },
      { name: 'skip', value: 'skip' },
    ],
  })
  if (paymentProvider === 'stripe') {
    optional.STRIPE_SECRET_KEY = await password({ message: 'STRIPE_SECRET_KEY' })
    optional.STRIPE_WEBHOOK_SECRET = await password({ message: 'STRIPE_WEBHOOK_SECRET' })
  }
  if (paymentProvider === 'creem') {
    optional.CREEM_API_KEY = await password({ message: 'CREEM_API_KEY' })
    optional.CREEM_WEBHOOK_SECRET = await password({ message: 'CREEM_WEBHOOK_SECRET' })
    optional.CREEM_PRODUCTS = await input({
      message: 'CREEM_PRODUCTS（reference=prod_xxx，逗号分隔）',
      default: 'pro_monthly=prod_,pro_yearly=prod_,lifetime=prod_',
    })
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
    optional.CLOUDFLARE_ACCOUNT_ID = await input({ message: 'CLOUDFLARE_ACCOUNT_ID' })
    optional.CLOUDFLARE_API_TOKEN = await password({ message: 'CLOUDFLARE_API_TOKEN' })
    optional.CLOUDFLARE_EMAIL_SENDER = await input({
      message: 'CLOUDFLARE_EMAIL_SENDER (e.g. support@example.com)',
      default: `support@${projectName}.com`,
    })
  } else if (mailProvider === 'resend') {
    optional.RESEND_API_KEY = await password({ message: 'RESEND_API_KEY' })
  }

  const enableDiscord = await confirm({ message: '启用 Discord 通知？', default: false })
  if (enableDiscord) {
    optional.DISCORD_WEBHOOK_URL = await input({ message: 'DISCORD_WEBHOOK_URL' })
  }

  const currentEnv = prepareEnvFile()
  const updates = buildEnvUpdates({
    current: currentEnv,
    dbId: resources.dbId,
    authSecret,
    optional,
  })
  writeEnvFile('.env', updateEnv(currentEnv, updates))
  console.log('✅ .env 已更新')

  const wranglerRaw = readFileSync('wrangler.jsonc', 'utf-8')
  writeFileSync(
    'wrangler.jsonc',
    applyResourceBindings(wranglerRaw, {
      dbName: resources.dbName,
      dbId: resources.dbId,
      kvId: resources.kvId,
    }),
  )
  console.log('✅ wrangler.jsonc 已更新')
  console.log(
    'ℹ️  未创建 R2：需先在 Cloudflare Dashboard 开通 R2（免费额度内不收费，但要绑支付方式），再取消 wrangler.jsonc 里 r2_buckets 的注释。',
  )

  try {
    run('pnpm exec wrangler d1 migrations apply DB --local')
  } catch (e) {
    console.warn(`⚠️  本地迁移失败：${(e as Error).message.split('\n')[0]}`)
  }

  console.log('\n✅ Setup 完成。下一步：')
  console.log('  pnpm dev    启动开发服务器')
  console.log('  pnpm deploy 部署到 Cloudflare')
}

/**
 * 只有被直接执行时才跑交互流程。
 *
 * 之前 `main()` 写在模块顶层，import 这个模块就会弹交互框 —— 测试里表现为
 * 一个永不返回的 prompt，被 import 的模块不该有这类副作用。
 */
function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url.split('?')[0] === pathToFileURL(resolve(entry)).href
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
