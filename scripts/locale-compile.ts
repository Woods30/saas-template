/**
 * Paraglide 编译的幂等包装。
 *
 * `paraglide-js compile` 实测 ~18s，且在 `check` / `typecheck` / `test` /
 * `check:locale` 里被重复调用。产物（outdir）只要比全部输入新，即可跳过编译。
 *
 * 输入：`messages/*.json`、`project.inlang/**`。产物目录取自
 * `project.inlang/paraglide.config.ts` 的 outdir（与 CLI / vite 插件同源）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES_DIR = 'messages'
const INLANG_DIR = 'project.inlang'
const OUT_DIR = 'src/locale/paraglide'

/** 递归取目录下所有文件的最新 mtime（秒）；目录不存在返回 0。 */
function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

/**
 * 产物是否已是最新。
 * `root` 便于单测注入临时目录；默认即仓库根（相对 cwd）。
 */
export function isCompileUpToDate({ root = '.' }: { root?: string } = {}): boolean {
  const outDir = join(root, OUT_DIR)
  // 产物缺失（如全新 clone）→ 必须编译。
  if (!existsSync(join(outDir, 'runtime.js'))) return false
  const outTime = newestMtime(outDir)
  const inputTime = Math.max(
    newestMtime(join(root, MESSAGES_DIR)),
    newestMtime(join(root, INLANG_DIR)),
  )
  // 产物严格晚于输入才算最新；相等（同秒）保守重编。
  return outTime > inputTime
}

// CLI：非 `--force` 且已最新则跳过。
if (process.argv[1]?.endsWith('locale-compile.ts')) {
  const force = process.argv.includes('--force')
  if (!force && isCompileUpToDate()) {
    console.log('locale:compile 跳过（产物已是最新）')
  } else {
    execFileSync('pnpm', ['exec', 'paraglide-js', 'compile', '--project', './project.inlang'], {
      stdio: 'inherit',
    })
  }
}
