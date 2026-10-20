import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { CORE_PATHS, isCorePath } from '../../scripts/core-paths'

/**
 * 核心区判定：命中则本地与 CI 跑全量回归 + e2e。
 */
describe('isCorePath', () => {
  it('认证 / 支付 / env / 门禁 / 数据库 / server / api 路由属于核心区', () => {
    expect(isCorePath('src/auth/auth.ts')).toBe(true)
    expect(isCorePath('src/payment/index.ts')).toBe(true)
    expect(isCorePath('src/env/server.ts')).toBe(true)
    expect(isCorePath('src/lib/module-access.ts')).toBe(true)
    expect(isCorePath('src/db/schema.ts')).toBe(true)
    expect(isCorePath('src/server.ts')).toBe(true)
    expect(isCorePath('src/routes/api/contact/index.ts')).toBe(true)
    expect(isCorePath('src/config/website.ts')).toBe(true)
    expect(isCorePath('src/lib/locale.ts')).toBe(true)
    expect(isCorePath('wrangler.jsonc')).toBe(true)
  })

  it('营销组件 / 样式 / 文案不属于核心区', () => {
    expect(isCorePath('src/components/sections/hero/Hero.tsx')).toBe(false)
    expect(isCorePath('src/styles/globals.css')).toBe(false)
    expect(isCorePath('messages/zh.json')).toBe(false)
    expect(isCorePath('docs/architecture.md')).toBe(false)
  })

  it('清单非空且无重复', () => {
    expect(CORE_PATHS.length).toBeGreaterThan(0)
    expect(new Set(CORE_PATHS).size).toBe(CORE_PATHS.length)
  })
})

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')
const checkCoreChanged = join(repoRoot, 'scripts', 'check-core-changed.ts')

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** 在仓库根用 tsx 运行 CLI，返回退出码与输出（不抛出，便于断言任意退出码）。 */
function runCheckCore(base: string, cwd: string = repoRoot): RunResult {
  try {
    const stdout = execFileSync(tsxBin, [checkCoreChanged, base], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
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

const createdDirs: string[] = []

afterAll(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

/**
 * 新建隔离 git 仓库：`main` 有一次提交，HEAD 位于**无共同祖先**的 `orphan` 分支。
 *
 * 复现「ref 可解析但无 merge base」：`git rev-parse --verify --quiet main^{commit}` 退出 0
 * （前置 ref 校验通过），但 `git diff main...HEAD` 因 no merge base 退出 128。
 */
function makeOrphanRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'saas-core-changed-'))
  createdDirs.push(dir)
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'test'])
  writeFileSync(join(dir, 'a.txt'), 'a\n', 'utf-8')
  git(['add', '.'])
  git(['commit', '-qm', 'init'])
  git(['branch', '-m', 'main'])
  git(['checkout', '-q', '--orphan', 'orphan'])
  writeFileSync(join(dir, 'b.txt'), 'b\n', 'utf-8')
  git(['add', '.'])
  git(['commit', '-qm', 'orphan'])
  return dir
}

/**
 * `check-core-changed.ts` 的退出码契约（黑盒：真实 spawn，断言真实退出码）。
 *
 * 三个码语义不同、必须可区分：
 * - `0` 命中核心区（需全量回归）；
 * - `1` 确属未触及核心区（跳过回归）；
 * - `2` base ref 无效——**不得与 `1` 混淆**。Task 5 的 CI 门禁写作
 *   `if tsx scripts/check-core-changed.ts <ref>; then core=true; else core=false; fi`，
 *   若无效 ref 落回 `1`，则「无法判定」会被静默读成「非核心」而跳过 e2e（fail-open）。
 */
describe('check-core-changed CLI 退出码', () => {
  it('base ref 无效时退出码为 2（可与「非核心」的 1 区分），且 stderr 指明该 ref', () => {
    const result = runCheckCore('nonexistent-ref-for-fail-loud-check')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('nonexistent-ref-for-fail-loud-check')
  })

  it('确属未触及核心区时退出码为 1（保持既有契约）', () => {
    // base=HEAD 的 diff 恒为空 → 无核心改动。
    const result = runCheckCore('HEAD')
    expect(result.code).toBe(1)
  })

  it('无效 ref（2）与非核心（1）的退出码互不相同', () => {
    expect(runCheckCore('nonexistent-ref-for-fail-loud-check').code).not.toBe(
      runCheckCore('HEAD').code,
    )
  })

  /**
   * ref 可解析但 `git diff` 失败（无 merge base）也必须落 2，不得落到 1。
   *
   * 这是同一 fail-open 的更窄触发面：`main` 通过 ref 前置校验，但孤儿分支与 `main` 无
   * 共同祖先，`git diff main...HEAD` 退出 128。若不捕获，execFileSync 抛异常 → Node 退出
   * 1，与「确属非核心」不可区分，CI 门禁会静默跳过 e2e。测试用隔离临时仓库复现，不触碰
   * 真实仓库的分支 / 提交。
   */
  it('ref 有效但无 merge base（diff 失败）时退出码为 2，且 stderr 指明该 ref', () => {
    const result = runCheckCore('main', makeOrphanRepo())
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('main')
  })
})
