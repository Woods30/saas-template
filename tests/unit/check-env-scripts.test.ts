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

const checkEnv = 'scripts/check-env.ts'
const checkEnvProd = 'scripts/check-env-prod.ts'
const checkBundle = 'scripts/check-client-bundle.ts'

// 合成 secret：仅用于测试，绝非真实凭据。
const VALID_SECRET = 'test-better-auth-secret-0123456789' // 36 字符，≥ 32
const SHORT_SECRET = 'too-short' // < 32 字符

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

/** 在指定 cwd 下用 tsx 运行脚本，返回退出码与输出。 */
function runScript(cwd: string, script: string, extraEnv: Record<string, string> = {}): RunResult {
  const env: Record<string, string | undefined> = { ...process.env, ...extraEnv }
  for (const key of dotenvKeys) {
    if (!(key in extraEnv)) delete env[key]
  }

  try {
    const stdout = execFileSync(tsxBin, [script], {
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

  it('缺少 `.env` 时给出可操作的提示并失败', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkEnv)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('.env')
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
  it('缺少 `.env` 时失败', () => {
    const dir = makeWorkspace()
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('.env')
  })

  it('`.env` 的 NODE_ENV=development 无法绕过生产校验（缺少 secret 即失败）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, 'NODE_ENV=development\n')
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('BETTER_AUTH_SECRET')
  })

  it('生产 secret 过短（< 32 字符）失败', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET=${SHORT_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('BETTER_AUTH_SECRET')
    expect(result.stderr).not.toContain(SHORT_SECRET)
  })

  it('引用包裹的合法 secret 通过', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET="${VALID_SECRET}"\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('生产环境变量校验通过')
  })

  it('非法 DISCORD_WEBHOOK_URL 失败', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `BETTER_AUTH_SECRET=${VALID_SECRET}\nDISCORD_WEBHOOK_URL=not-a-url\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('DISCORD_WEBHOOK_URL')
  })

  it('进程 env 提供合法 secret 时通过', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, '# 空 .env\n')
    const result = runScript(dir, checkEnvProd, { BETTER_AUTH_SECRET: VALID_SECRET })
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })

  it('VITE_BASE_URL=localhost 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('localhost')
  })

  it('VITE_BASE_URL=127.0.0.1 失败（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(dir, `VITE_BASE_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`)
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('VITE_BASE_URL')
    expect(result.stderr).not.toContain('127.0.0.1')
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

  it('合法 prod URL 通过（无值回显）', () => {
    const dir = makeWorkspace()
    writeDotEnv(
      dir,
      `VITE_BASE_URL=https://real-site.example.com\nBETTER_AUTH_SECRET=${VALID_SECRET}\n`,
    )
    const result = runScript(dir, checkEnvProd)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('生产环境变量校验通过')
    expect(result.stderr).not.toContain('real-site')
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
    writeBundleFile(dir, 'assets/leak.js', 'CLOUDFLARE_API_TOKEN\n')
    const result = runScript(dir, checkBundle)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('CLOUDFLARE_API_TOKEN')
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
