#!/usr/bin/env tsx
import { execFileSync, execSync } from 'node:child_process'

/**
 * 把某个账号提为管理员：`UPDATE users SET role = 'admin' WHERE email = ?`。
 * 第一个管理员无法由 UI 产生（管理页本身要 admin），故只能走 CLI。
 *
 * 用法（必须显式指定目标库，避免误改生产）：
 *   pnpm db:admin:local  you@example.com
 *   pnpm db:admin:remote you@example.com
 */

/**
 * 邮箱校验：够挡住明显的笔误与注入，不追求 RFC 5322 完备。字符集刻意收窄以排除
 * `$`、反引号、`;`、空格；单引号是合法邮箱字符，保留并由 SQL 转义处理。
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** 构造提权 SQL：先用正则挡掉非法邮箱，再把 `'` 转义为 `''`（SQL 标准做法）。 */
export function buildSetAdminSql(email: string): string {
  const trimmed = email.trim()
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new Error(`无效的邮箱地址：${email}`)
  }
  const escaped = trimmed.replaceAll("'", "''")
  return `UPDATE users SET role = 'admin' WHERE email = '${escaped}'`
}

function run(cmd: string, options: { stdio?: 'inherit' | 'pipe' } = {}) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: options.stdio ?? 'inherit' })
}

function usage(): never {
  console.error('用法：pnpm db:admin:<local|remote> <email>')
  console.error('  例：pnpm db:admin:local you@example.com')
  process.exit(1)
}

function main() {
  const [, , flag, email] = process.argv
  if (flag !== '--local' && flag !== '--remote') usage()
  if (!email) usage()

  // `--remote` 会改线上库，先软检查 wrangler 登录。
  if (flag === '--remote') {
    try {
      const out = run('wrangler whoami', { stdio: 'pipe' }).toString()
      const m = out.match(/associated with the email (.+?)[\n"]/)
      console.log(m ? `✅ wrangler 已登录：${m[1]}` : '✅ wrangler 已登录')
    } catch {
      console.warn('⚠️  wrangler 未登录（将继续；命令可能失败）')
    }
  }

  const sql = buildSetAdminSql(email)
  // `execFileSync` 传参数数组、不经 shell：邮箱里的特殊字符不会被当成命令执行。
  console.log(`$ wrangler d1 execute DB ${flag} --command "${sql}"`)
  execFileSync('wrangler', ['d1', 'execute', 'DB', flag, '--command', sql], { stdio: 'inherit' })
  console.log(`✅ 已将 ${email} 提为管理员`)
}

// 仅在被当作脚本执行时跑 main；被测试 import 时不执行。
if (process.argv[1]?.includes('set-admin')) {
  main()
}
