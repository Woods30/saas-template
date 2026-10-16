import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveRawEnv } from '../../scripts/lib/env-file'

/**
 * `scripts/check-env.ts`、`scripts/check-env-prod.ts`、`scripts/check-client-bundle.ts` 的黑盒测试。
 *
 * 这三个脚本都在**当前工作目录**读取 `.env` / 扫描 `dist/client`，因此测试必须在隔离的
 * 临时 cwd 中 `spawn` 它们，才能既使用真实文件样例，又不触碰用户仓库里的 `.env`。
 *
 * 做法：在每个临时目录内创建 `scripts` 符号链接（指向本仓库的脚本），使脚本内的相对导入
 * `../src/env/*` 正确解析到仓库源码；同时把 cwd 切到临时目录，脚本便只看到临时的 `.env`
 * 与 `dist/client`。测试结束仅删除自己创建的临时目录。
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')
// 脚本从仓库根运行时靠 `tsconfig.json` 的 `paths` 解析 `@/*` 别名；测试把 cwd 切到临时目录后
// 该 tsconfig 不在解析路径上，需显式指回仓库 tsconfig，才能加载 `src/config/website` 等模块。
const repoTsconfig = join(repoRoot, 'tsconfig.json')

const checkEnv = 'scripts/check-env.ts'
const checkEnvProd = 'scripts/check-env-prod.ts'
const checkBundle = 'scripts/check-client-bundle.ts'

// 合成 secret / URL：仅用于测试，绝非真实凭据。
const VALID_SECRET = 'test-better-auth-secret-0123456789' // 36 字符，≥ 32
const SHORT_SECRET = 'too-short' // < 32 字符
const VALID_URL = 'https://jerbix.dev' // 合法生产域名（真实形状，非保留域）

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * 仓库 `.env.example` 中的键名集合。
 *
 * Vitest 会把仓库根的 `.env` 载入 `process.env`，若不清理，子进程会继承这些值并经
 * 「进程 env 覆盖 .env」的规则盖过临时 `.env`，使负例测试失真。这里在派生子进程前
 * 删除这些键，让每个测试的临时 `.env` 成为唯一来源（显式传入的 `extraEnv` 除外）。
 */
const dotenvKeys = readFileSync(join(repoRoot, '.env.example'), 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .map((line) => line.slice(0, line.indexOf('=')))
  .filter((key) => key.length > 0)

/**
 * 需要从子进程环境里额外清除的键。
 *
 * `.env.example` 未列出、但已在 `src/env` schema 声明或会影响校验的进程变量：
 * - `NODE_ENV`：Vitest 运行在 `test`，若继承会干扰生产语义断言；
 * - `ADMIN_EMAILS`、`BEEHIIV_SEND_WELCOME_EMAIL`、`VITE_UMAMI_WEBSITE_ID`、
 *   `VITE_CLARITY_PROJECT_ID`：schema 已声明，防止真实值经进程 env 泄漏进子进程。
 */
const EXTRA_ENV_KEYS = [
  'NODE_ENV',
  'ADMIN_EMAILS',
  'BEEHIIV_SEND_WELCOME_EMAIL',
  'VITE_UMAMI_WEBSITE_ID',
  'VITE_CLARITY_PROJECT_ID',
] as const

/** 从子进程环境删除的键集合：`.env.example` 全部键 + 额外键，确保临时 `.env` 是唯一来源。 */
const scrubKeys = [...dotenvKeys, ...EXTRA_ENV_KEYS]

/** 在指定 cwd 下用 tsx 运行脚本，返回退出码与输出。 */
function runScript(cwd: string, script: string, extraEnv: Record<string, string> = {}): RunResult {
  const env: Record<string, string | undefined> = { ...process.env, ...extraEnv }
  for (const key of scrubKeys) {
    if (!(key in extraEnv)) delete env[key]
  }

  try {
    const stdout = execFileSync(tsxBin, ['--tsconfig', repoTsconfig, script], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string }
    return {
      code: err.status ?? 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : '',
    }
  }
}

/** 临时目录名，与仓库内脚本的 `scripts` 符号链接互不影响。 */
const createdDirs: string[] = []

/** 新建隔离 cwd：含指向仓库脚本的 `scripts` 符号链接。 */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'saas-env-check-'))
  createdDirs.push(dir)
  symlinkSync(join(repoRoot, 'scripts'), join(dir, 'scripts'), 'dir')
  return dir
}

/** 写入 `.env`（内容为原始文本，便于测试引用/注释/空串等解析细节）。 */
function writeDotEnv(dir: string, content: string): void {
  writeFileSync(join(dir, '.env'), content, 'utf-8')
}

/** 写入 `.env.production`；生产校验应优先读它，缺省才回退 `.env`。 */
function writeDotEnvProduction(dir: string, content: string): void {
  writeFileSync(join(dir, '.env.production'), content, 'utf-8')
}

/** 在 `dist/client` 下写入一个相对路径文件。 */
function writeBundleFile(dir: string, relativePath: string, content: string): void {
  const full = join(dir, 'dist', 'client', relativePath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

afterAll(() => {
  // 仅清理本测试创建的临时目录，绝不触碰仓库或用户的 `.env`。
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('check-env.ts（开发校验）', () => {
  let exampleEnv: string
  beforeAll(() => {
    exampleEnv = readFileSync(join(repoRoot, '.env.example'), 'utf-8')
  })

  it('`.env.example` 原样复制为 `.env` 即可通过开发检查', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, exampleEnv)
    const result = runScript(dir, checkEnv)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('开发环境变量校验通过')
  })

  it('缺少 `.env` 时改用进程 env（CI）：合法字段即通过', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkEnv, { VITE_BASE_URL: VALID_URL })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('开发环境变量校验通过')
  })

  it('缺少 `.env` 时进程 env 的非法字段仍失败', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkEnv, { VITE_BASE_URL: 'not-a-url' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('not-a-url')
  })

  it('非法 VITE_BASE_URL 失败，且只报变量名不打印值', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, 'VITE_BASE_URL=not-a-url\n')
    const result = runScript(dir, checkEnv)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('not-a-url')
  })

  it('非法 enum（VITE_PAYMENT_PROVIDER）失败', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, 'VITE_PAYMENT_PROVIDER=creem\n')
    const result = runScript(dir, checkEnv)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_PAYMENT_PROVIDER')
  })

  it('空串视为未设置：全空 optional 字段仍通过开发检查', () => {
    const dir = makeWorkspace()
    writeDotEnv(
      dir,
      ['VITE_BASE_URL=', 'VITE_PAYMENT_PROVIDER=', 'VITE_GA_ID=', 'BETTER_AUTH_SECRET='].join('\n'),
    )
    const result = runScript(dir, checkEnv)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('引号包裹的 URL 被正确解析（不使用 split）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, 'VITE_BASE_URL="https://acme.example.com"\n')
    const result = runScript(dir, checkEnv)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('进程 env 覆盖 `.env`（`.env` 非法但进程值合法则通过）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, 'VITE_BASE_URL=not-a-url\n')
    const result = runScript(dir, checkEnv, { VITE_BASE_URL: 'https://override.example.com' })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })
})

describe('check-env-prod.ts（生产校验）', () => {
  it('缺少 `.env` 但进程 env 完整时通过（CI）', () => {
    const result = runScript(makeWorkspace(), checkEnvProd, {
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      VITE_BASE_URL: VALID_URL,
    })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stderr).not.toContain('a'.repeat(32))
    expect(result.stdout).toContain('生产环境变量校验通过')
  })

  it('缺少 `.env` 且进程 env 不完整时失败（报字段名不报值）', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
  })

  it('存在 `.env.production` 时优先读它，忽略 `.env` 的本地值', () => {
    // 生产部署的约定：`pnpm deploy` 校验的是 `.env.production`，而不是开发用的 `.env`。
    // 若仍读 `.env`，本地 localhost 会让校验失败——即使生产配置本身完全正确。
    const dir = makeWorkspace()
    writeDotEnv(dir, 'VITE_BASE_URL=http://localhost:3000\n')
    writeDotEnvProduction(dir, `BETTER_AUTH_SECRET=${VALID_SECRET}\nVITE_BASE_URL=${VALID_URL}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('生产环境变量校验通过')
  })

  it('`.env.production` 非法时不回退到合法的 `.env`', () => {
    // 有 `.env.production` 就以它为准：回退会让「生产配置写错了」被本地值悄悄掩盖。
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET=${VALID_SECRET}\nVITE_BASE_URL=${VALID_URL}\n`)
    writeDotEnvProduction(dir, 'VITE_BASE_URL=http://localhost:3000\n')
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
  })

  it('无 `.env.production` 时回退读 `.env`（保持既有行为）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET=${VALID_SECRET}\nVITE_BASE_URL=${VALID_URL}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('`.env` 的 NODE_ENV=development 无法绕过生产校验（缺少 secret 即失败）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `NODE_ENV=development\nVITE_BASE_URL=${VALID_URL}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('BETTER_AUTH_SECRET')
  })

  it('生产 secret 过短（< 32 字符）失败', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=${VALID_URL}\nBETTER_AUTH_SECRET=${SHORT_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('BETTER_AUTH_SECRET')
    expect(result.stderr).not.toContain(SHORT_SECRET)
  })

  it('引用包裹的合法 secret 通过', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=${VALID_URL}\nBETTER_AUTH_SECRET="${VALID_SECRET}"\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('生产环境变量校验通过')
  })

  it('非法 DISCORD_WEBHOOK_URL 失败', () => {
    const dir = makeWorkspace()
    writeDotEnv(
      dir,
      `VITE_BASE_URL=${VALID_URL}\nBETTER_AUTH_SECRET=${VALID_SECRET}\nDISCORD_WEBHOOK_URL=not-a-url\n`,
    )
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('DISCORD_WEBHOOK_URL')
  })

  it('进程 env 提供合法 secret 与 URL 时通过', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, '# 空 .env\n')
    const result = runScript(dir, checkEnvProd, {
      BETTER_AUTH_SECRET: VALID_SECRET,
      VITE_BASE_URL: VALID_URL,
    })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('默认关闭的服务模块不要求其 secret 齐备', () => {
    const dir = makeWorkspace()
    // 只提供生产必需的 URL 与 auth secret，未提供 RESEND / STRIPE 等服务端凭据。
    writeDotEnv(dir, `VITE_BASE_URL=${VALID_URL}\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('生产缺少公开 URL 不能借默认 localhost 通过', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET=${'b'.repeat(32)}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('b'.repeat(32))
  })

  it('生产 VITE_BASE_URL 为空串失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
  })

  it('生产 VITE_BASE_URL 为 HTTP（非 HTTPS）失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=http://jerbix.dev\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('jerbix.dev')
  })

  it('VITE_BASE_URL=localhost 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('localhost')
  })

  it('VITE_BASE_URL=IPv6 loopback 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://[::1]:3000\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('::1')
  })

  it('VITE_BASE_URL=127.0.0.1 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('127.0.0.1')
  })

  it('VITE_BASE_URL=0.0.0.0 失败（无值回显）', () => {
    const dir = makeWorkspace()
    // 用 https 隔离 host 守卫，否则 http 会先被协议守卫拦下，无法证明 0.0.0.0 分支生效。
    writeDotEnv(dir, `VITE_BASE_URL=https://0.0.0.0\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('0.0.0.0')
  })

  it('VITE_BASE_URL=裸保留域名 example.net 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://example.net\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('example.net')
  })

  it('VITE_BASE_URL=裸保留域名 example.org 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://example.org\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('example.org')
  })

  it('VITE_BASE_URL 内嵌凭据失败（无值回显）', () => {
    const dir = makeWorkspace()
    // 合成凭据：仅用于测试，绝非真实凭据。
    const credentialUrl = 'https://user:pass@jerbix.dev@jerbix.dev'
    writeDotEnv(dir, `VITE_BASE_URL=${credentialUrl}\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('pass@jerbix.dev')
  })

  it('VITE_BASE_URL=*.example.com 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(
      dir,
      `VITE_BASE_URL=https://myapp.example.com\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`,
    )
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('example.com')
  })

  it('VITE_BASE_URL=裸保留域名 example.com 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://example.com\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('example.com')
  })

  it('VITE_BASE_URL=*.example 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://myapp.example\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('example')
  })

  it('VITE_BASE_URL=*.test 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=https://myapp.test\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('test')
  })

  it('合法生产 URL https://jerbix.dev 通过（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=${VALID_URL}\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('生产环境变量校验通过')
    expect(result.stderr).not.toContain('jerbix.dev')
  })
})

describe('check-client-bundle.ts（bundle 扫描）', () => {
  it('缺少 dist/client 目录时失败', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('dist/client')
  })

  it('dist/client 为空（无任何产物）时失败', () => {
    const dir = makeWorkspace()
    mkdirSync(join(dir, 'dist', 'client'), { recursive: true })
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('dist/client')
  })

  it('干净产物通过', () => {
    const dir = makeWorkspace()
    writeBundleFile(dir, 'assets/index.js', 'export const x = 1\n')
    writeBundleFile(dir, 'index.html', '<!doctype html><html></html>\n')
    const result = runScript(dir, checkBundle)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('不含敏感字段')
  })

  it('嵌套目录中的 .js 命中 secret 字段名时失败', () => {
    const dir = makeWorkspace()
    writeBundleFile(dir, 'index.html', '<!doctype html><html></html>\n')
    writeBundleFile(dir, 'assets/deep/nested.js', 'const STRIPE_SECRET_KEY = "leaked"\n')
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('STRIPE_SECRET_KEY')
  })

  it('覆盖 schema 中全部 secret 字段（含 CLOUDFLARE_API_TOKEN）', () => {
    const dir = makeWorkspace()
    writeBundleFile(dir, 'index.html', '<!doctype html><html></html>\n')
    writeBundleFile(dir, 'assets/leak.js', 'const CLOUDFLARE_API_TOKEN = "literal-leaked-value"\n')
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('CLOUDFLARE_API_TOKEN')
  })

  it('better-auth env Proxy 模式（get KEY(){return s(KEY)}）不视为泄露', () => {
    const dir = makeWorkspace()
    writeBundleFile(dir, 'index.html', '<!doctype html><html></html>\n')
    writeBundleFile(
      dir,
      'assets/proxy.js',
      `Object.freeze({get BETTER_AUTH_SECRET(){return s("BETTER_AUTH_SECRET")}})\n`,
    )
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(0)
  })
})

describe('resolveRawEnv（.env 缺失与合并规则）', () => {
  it('`.env` 不存在时回退为空文件，不抛 ENOENT', () => {
    const dir = makeWorkspace()
    const raw = resolveRawEnv(join(dir, '.env'))
    // 进程 env 仍在（如 PATH），但 `.env` 独有的键不应凭空出现。
    expect(raw).not.toHaveProperty('__SAAS_ENV_FILE_ONLY__')
    expect(typeof raw).toBe('object')
  })

  it('文件独有的键被读入，进程 env 同键优先', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, '__SAAS_ENV_FILE_ONLY__=from-file\nVITE_BASE_URL=from-file\n')

    // 显式设置进程 env 值（合成），使「进程 env 优先」规则恒定被验证，不依赖外部是否设置。
    const processValue = 'https://process-override.jerbix.dev'
    const previous = process.env.VITE_BASE_URL
    process.env.VITE_BASE_URL = processValue
    try {
      const raw = resolveRawEnv(join(dir, '.env'))
      // 文件独有键被读入。
      expect(raw.__SAAS_ENV_FILE_ONLY__).toBe('from-file')
      // 同键取进程 env 值，而非文件里的 from-file。
      expect(raw.VITE_BASE_URL).toBe(processValue)
    } finally {
      if (previous === undefined) delete process.env.VITE_BASE_URL
      else process.env.VITE_BASE_URL = previous
    }
  })
})

// 断言：仓库根存在 `.env.example`，且脚本文件已就位（避免误删后测试静默通过）。
describe('交付物存在性', () => {
  it('.env.example 与三个脚本均在仓库根就位', () => {
    expect(existsSync(join(repoRoot, '.env.example'))).toBe(true)
    expect(existsSync(join(repoRoot, checkEnv))).toBe(true)
    expect(existsSync(join(repoRoot, checkEnvProd))).toBe(true)
    expect(existsSync(join(repoRoot, checkBundle))).toBe(true)
  })
})
