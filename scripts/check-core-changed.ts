/**
 * 判定本次改动是否触及核心区（`git diff --name-only <base>...HEAD`，默认 origin/main）。
 *
 * 退出码必须三态：0 命中核心区，1 确属未触及，2 无法判定（ref 无效 / 无 merge base）。
 * 若「无法判定」落回 1，CI 门禁会静默跳过 e2e（fail-open）。
 */
import { execFileSync } from 'node:child_process'
import { isCorePath } from './core-paths'

/** 无法判定时的退出码。 */
export const EXIT_INVALID_REF = 2

/**
 * 变更文件；diff 失败返回 null。ref 有效但无 merge base 时 git 退出 128，异常若逃逸，
 * Node 会以 1 结束——与「确属非核心」不可区分，故归一到 null。
 */
function changedFiles(base: string): string[] | null {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(
      `错误：无法计算 "${base}...HEAD" 的差异（ref 可解析但无共同祖先 / 历史无关），` +
        `无法判定是否触及核心区。\n${detail}`,
    )
    return null
  }
}

/** base ref 是否解析为一次提交。 */
function refExists(ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

const base = process.argv[2] ?? 'origin/main'

if (!refExists(base)) {
  console.error(
    `错误：base ref "${base}" 无法解析为提交，无法判定是否触及核心区。\n` +
      `请检查 ref 拼写，或先执行 git fetch（浅克隆 / 新 clone 常缺少 origin/main）。`,
  )
  process.exit(EXIT_INVALID_REF)
}

const files = changedFiles(base)

// diff 失败同样以 2 退出，绝不落到 1。
if (files === null) process.exit(EXIT_INVALID_REF)

const core = files.filter(isCorePath)

if (core.length > 0) {
  console.log(`核心区改动 ${core.length} 处，需全量回归：`)
  for (const f of core) console.log(`  ${f}`)
  process.exit(0)
}
console.log('未触及核心区，跳过全量回归。')
process.exit(1)
