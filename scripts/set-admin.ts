#!/usr/bin/env tsx
import { execFileSync, execSync } from 'node:child_process'

/**
 * 把某个账号提为管理员。
 *
 * 为什么是 CLI 而不是 UI：第一个管理员无法由 UI 产生——管理页本身要 admin 才能进。
 * 这是对齐 tanstarter 的做法，也是本仓唯一的「自助提权」入口。
 *
 * 只做一件事：`UPDATE users SET role = 'admin' WHERE email = ?`。不读 `.env`、不碰
 * better-auth——`role` 是 `users` 表的普通列（默认 `'user'`），直接改库即可生效，
 * 用户下次取会话时就会带上新角色。
 *
 * 用法（必须显式指定目标库，避免误改生产）：
 *   pnpm db:admin:local  you@example.com
 *   pnpm db:admin:remote you@example.com
 */

/**
 * 邮箱校验：够挡住明显的笔误与注入，不追求 RFC 5322 完备。
 *
 * 字符集刻意收窄：局部部分只允许「字母数字 + `. _ % + - '`」，域部分只允许
 * 「字母数字 + `. -`」。它排除了 `$`、反引号、`;`、空格，因此即便将来有人把这里的值
 * 又拼回命令字符串，也拼不出可执行的注入。单引号 `'` 是合法的邮箱字符（如
 * `o'brien@example.com`），保留它、由 SQL 转义处理，而不是拒之门外。执行侧另有
 * `execFileSync` 参数数组兜底（见 `main()`）。
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/**
 * 构造提权 SQL。
 *
 * 邮箱来自命令行，直接拼接会有注入风险；SQL 字符串里转义单引号的办法是**写成两个**
 * （`'` → `''`），这是 SQL 标准做法。先用正则挡掉不合法的邮箱，再转义。
 */
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

  // `--remote` 会改线上库，先软检查 wrangler 登录（照 scripts/setup.ts 的做法）。
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
  // 用 `execFileSync` 传参数数组，不经过 shell：邮箱里的 `$`、反引号、`;` 都只会当作
  // 普通字符传给 wrangler，不会被执行。这是比「转义后拼命令字符串」更硬的保证。
  console.log(`$ wrangler d1 execute DB ${flag} --command "${sql}"`)
  execFileSync('wrangler', ['d1', 'execute', 'DB', flag, '--command', sql], { stdio: 'inherit' })
  console.log(`✅ 已将 ${email} 提为管理员`)
}

// 仅在被当作脚本执行时跑 main；被测试 import 时不执行。
if (process.argv[1]?.includes('set-admin')) {
  main()
}
