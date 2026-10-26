import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { LOCALES } from '@/config/locale'

/**
 * `scripts/check-locale.ts` 黑盒测试：在隔离临时 cwd 中 spawn（脚本按 cwd 读取
 * `messages/` 与 `project.inlang/settings.json`）。重点覆盖文件集合与 `LOCALES` 一一对应。
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')
const repoTsconfig = join(repoRoot, 'tsconfig.json')

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function runCheckLocale(cwd: string): RunResult {
  try {
    const stdout = execFileSync(tsxBin, ['--tsconfig', repoTsconfig, 'scripts/check-locale.ts'], {
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

/** 新建隔离 cwd：含 `scripts` 符号链接与空的 `messages/`。 */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'saas-locale-check-'))
  createdDirs.push(dir)
  symlinkSync(join(repoRoot, 'scripts'), join(dir, 'scripts'), 'dir')
  mkdirSync(join(dir, 'messages'), { recursive: true })
  return dir
}

/** 写入 `project.inlang/settings.json`（只关心 `baseLocale`）。 */
function writeSettings(dir: string, baseLocale: string): void {
  mkdirSync(join(dir, 'project.inlang'), { recursive: true })
  writeFileSync(
    join(dir, 'project.inlang', 'settings.json'),
    `${JSON.stringify({ baseLocale, locales: [...LOCALES] }, null, 2)}\n`,
    'utf-8',
  )
}

/** 写入 `messages/<locale>.json`。 */
function writeMessages(dir: string, locale: string, keys: string[]): void {
  const record: Record<string, string> = { $schema: './schema.json' }
  for (const key of keys) record[key] = `${locale}:${key}`
  writeFileSync(
    join(dir, 'messages', `${locale}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf-8',
  )
}

/** 写入全部受支持语言的消息文件，键集合一致。 */
function writeAllMessages(dir: string, keys: string[]): void {
  for (const locale of LOCALES) writeMessages(dir, locale, keys)
}

afterAll(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('check-locale.ts', () => {
  it('所有受支持语言齐备且键一致时通过', () => {
    const dir = makeWorkspace()
    writeSettings(dir, LOCALES[0] as string)
    writeAllMessages(dir, ['hello', 'world'])
    const result = runCheckLocale(dir)
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('✅')
  })

  it('缺失某个受支持语言的消息文件时失败', () => {
    const dir = makeWorkspace()
    writeSettings(dir, LOCALES[0] as string)
    // 其余语言故意不建。
    writeMessages(dir, LOCALES[0] as string, ['hello'])
    const result = runCheckLocale(dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('messages')
  })

  it('存在不受支持语言的消息文件时失败', () => {
    const dir = makeWorkspace()
    writeSettings(dir, LOCALES[0] as string)
    writeAllMessages(dir, ['hello'])
    writeMessages(dir, 'ja', ['hello'])
    const result = runCheckLocale(dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('ja')
  })

  it('键集合不一致时失败并列出差异', () => {
    const dir = makeWorkspace()
    writeSettings(dir, LOCALES[0] as string)
    const base = LOCALES[0] as string
    const other = LOCALES[1] as string
    writeMessages(dir, base, ['hello', 'world'])
    writeMessages(dir, other, ['hello'])
    const result = runCheckLocale(dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('world')
  })

  it('baseLocale 不在受支持语言内时失败', () => {
    const dir = makeWorkspace()
    writeSettings(dir, 'ja')
    writeAllMessages(dir, ['hello'])
    const result = runCheckLocale(dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('baseLocale')
  })
})
