import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * init 的端到端冒烟：在临时目录里放一份「模板副本」，真跑一次脚本。
 *
 * 单测能验证每个变换，但只有真跑一次才能确认它们拼起来是连贯的 ——
 * 文件路径对不对、`.env` 有没有生成、重跑会不会把值改坏。
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')

/** init 会碰到的文件；直接从仓库复制真实内容，避免夹具与源码漂移。 */
const FIXTURE_FILES = [
  'package.json',
  'wrangler.jsonc',
  '.env.example',
  'messages/zh.json',
  'messages/en.json',
  'public/manifest.json',
  'src/config/website.ts',
  'src/config/products.ts',
]

const createdDirs: string[] = []

/** 建一个临时「模板副本」。 */
function makeTemplateCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'saas-init-smoke-'))
  createdDirs.push(dir)
  for (const relative of FIXTURE_FILES) {
    const target = join(dir, relative)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(repoRoot, relative), target)
  }
  return dir
}

/** 在指定目录跑 init。 */
function runInit(cwd: string, extraArgs: string[] = []): string {
  return execFileSync(
    tsxBin,
    [
      join(repoRoot, 'scripts/init/index.ts'),
      '--non-interactive',
      '--name',
      'Acme',
      '--slug',
      'acme',
      '--domain',
      'acme.dev',
      '--email',
      'hi@acme.dev',
      '--modules',
      'docs,mail',
      ...extraArgs,
    ],
    { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
  )
}

function read(dir: string, relative: string): string {
  return readFileSync(join(dir, relative), 'utf-8')
}

afterAll(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

describe('init 端到端', () => {
  it('一次运行改完品牌、模块、部署配置与 .env', () => {
    const dir = makeTemplateCopy()
    runInit(dir)

    expect(JSON.parse(read(dir, 'package.json')).name).toBe('acme')

    const zh = JSON.parse(read(dir, 'messages/zh.json')) as Record<string, string>
    expect(zh.site_name).toBe('Acme')
    expect(zh.home_demo_brand).toBe('Acme')
    // 吉祥物描述刻意保留原品牌：素材没换，描述跟着换会更别扭。
    expect(zh.home_mascot_alt).toContain('Jerbix')

    const en = JSON.parse(read(dir, 'messages/en.json')) as Record<string, string>
    expect(en.site_name).toBe('Acme')
    expect(en.home_demo_brand).toBe('Acme')

    expect(JSON.parse(read(dir, 'public/manifest.json')).name).toBe('Acme')

    // 一次性商品的显示名跟着品牌走，否则新站点里还摆着旧品牌的商品卡。
    expect(read(dir, 'src/config/products.ts')).toContain("name: 'Acme',")

    const website = read(dir, 'src/config/website.ts')
    expect(website).toContain("name: 'Acme',")
    expect(website).toContain("logoAccent: '',")
    // 实例工程可能把 docs 写成多行对象（带 siteUrl / homeUrl），只断言开关被打开。
    expect(website).toMatch(/docs: \{\s*enabled: true/)
    expect(website).toMatch(/blog: \{ enabled: false \}/)
    expect(website).toMatch(/mail: \{ enabled: true/)
    expect(website).toMatch(/payment: \{[^}]*enabled: false/)

    const wrangler = read(dir, 'wrangler.jsonc')
    expect(wrangler).toContain('"name": "acme"')
    expect(wrangler).toContain('"pattern": "acme.dev"')
    expect(wrangler).toContain('"database_name": "acme-db"')
    expect(wrangler).toContain('REPLACE_ME')
    // 注释是运维前提，不能被抹掉。
    expect(wrangler).toContain('//')
    expect(wrangler).toContain('"migrations_dir": "./src/core/db/migrations/sqlite"')
  })

  it('生成 .env：补 auth secret 与发件地址，保留原有注释', () => {
    const dir = makeTemplateCopy()
    runInit(dir)

    expect(existsSync(join(dir, '.env'))).toBe(true)
    const env = read(dir, '.env')
    expect(env).toMatch(/^BETTER_AUTH_SECRET=.{20,}$/m)
    expect(env).toContain('MAIL_FROM=noreply@acme.dev')
    // `.env.example` 的注释原样保留。
    expect(env).toContain('# 开发用环境变量')
  })

  it('重跑一次不再改动任何文件', () => {
    const dir = makeTemplateCopy()
    runInit(dir)
    const before = read(dir, 'package.json')
    const beforeEnv = read(dir, '.env')

    const output = runInit(dir)

    expect(read(dir, 'package.json')).toBe(before)
    // auth secret 不能被重新生成：那会让所有已登录会话失效。
    expect(read(dir, '.env')).toBe(beforeEnv)
    expect(output).toContain('无变化')
  })

  it('--dry-run 只打印计划，不写文件', () => {
    const dir = makeTemplateCopy()
    const before = read(dir, 'package.json')

    const output = runInit(dir, ['--dry-run'])

    expect(read(dir, 'package.json')).toBe(before)
    expect(existsSync(join(dir, '.env'))).toBe(false)
    expect(output).toContain('未写入任何文件')
  })
})
