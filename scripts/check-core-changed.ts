/**
 * 判定本次改动是否触及核心区。
 *
 * 用法：`tsx scripts/check-core-changed.ts [baseRef]`。
 * 变更文件取自 `git diff --name-only <base>...HEAD`（默认 base 为 origin/main）。
 *
 * 退出码（三态，**必须区分**）：
 * - `0` 命中核心区 → 需全量回归 + e2e；
 * - `1` 确属未触及核心区 → 可跳过全量回归；
 * - `2` **无法判定**，含两种情形：(a) base ref 无效（拼错 / 浅克隆未 fetch / 分支不存在）；
 *   (b) ref 有效但 `git diff <ref>...HEAD` 失败（孤儿分支 / 无关历史，无 merge base）。
 *
 * 本地 `pnpm check:core` 与 CI 的 e2e 门禁共用。门禁写作
 * `if tsx scripts/check-core-changed.ts <ref>; then ... else ... fi`，若「无法判定」落回
 * `1`，则会被静默读成「非核心」而跳过 e2e（fail-open）。因此两种无法判定都必须以独立
 * 退出码 2 显式失败，不得与 1 混同。
 */
import { execFileSync } from 'node:child_process'
import { isCorePath } from './core-paths'

/** 无法判定是否触及核心区（ref 无效，或 diff 失败）时的退出码。 */
export const EXIT_INVALID_REF = 2

/**
 * `git diff --name-only <base>...HEAD` 的变更文件；**diff 失败返回 null**。
 *
 * 仅靠 `refExists` 前置校验挡不住「ref 有效但无 merge base」（孤儿分支 / 无关历史）：
 * 此时 `git diff <base>...HEAD` 退出 128（`fatal: no merge base`）。若让 execFileSync 的
 * 异常逃逸，Node 会以退出码 1 结束——与「确属非核心」不可区分。故此处捕获并归一到 null，
 * 由调用方按「无法判定」以 2 退出。
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

/** base ref 是否解析为一次提交（`git rev-parse --verify --quiet <ref>` 退出码 0 即有效）。 */
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

// 无法判定（diff 失败）必须与「确属非核心」区分：同样以 2 退出，绝不落到 1。
if (files === null) process.exit(EXIT_INVALID_REF)

const core = files.filter(isCorePath)

if (core.length > 0) {
  console.log(`核心区改动 ${core.length} 处，需全量回归：`)
  for (const f of core) console.log(`  ${f}`)
  process.exit(0)
}
console.log('未触及核心区，跳过全量回归。')
process.exit(1)
