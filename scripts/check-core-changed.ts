/**
 * 判定本次改动是否触及核心区。
 *
 * 用法：`tsx scripts/check-core-changed.ts [baseRef]`。
 * 变更文件取自 `git diff --name-only <base>...HEAD`（默认 base 为 origin/main）。
 * 命中核心区退出码 0，否则 1——本地 `pnpm check:core` 与 CI 的 e2e 门禁共用。
 */
import { execFileSync } from 'node:child_process'
import { isCorePath } from './core-paths'

function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf-8',
  })
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

const base = process.argv[2] ?? 'origin/main'
const files = changedFiles(base)
const core = files.filter(isCorePath)

if (core.length > 0) {
  console.log(`核心区改动 ${core.length} 处，需全量回归：`)
  for (const f of core) console.log(`  ${f}`)
  process.exit(0)
}
console.log('未触及核心区，跳过全量回归。')
process.exit(1)
