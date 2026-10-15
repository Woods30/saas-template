/**
 * Paraglide 编译的幂等包装。
 *
 * `paraglide-js compile` 实测数秒，且在 `check` / `typecheck` / `test` /
 * `check:locale` 里被重复调用。输入未变时可跳过编译。
 *
 * 判定依据是「编译完成戳」（stamp）而非产物目录 mtime：paraglide 仅在内容变化时
 * 重写产物（`src/locale/paraglide/runtime.js` 的 mtime 会长期停滞），却每次编译都
 * 刷新 `project.inlang/cache/paraglide-js/*.json`。该 cache 位于输入目录内，若拿
 * 产物 mtime 去比输入 mtime，产物永远追不上 cache，跳过判定会永久失效。故：
 * - stamp 记录「最近一次成功编译」，与全部真实输入比新旧；
 * - 输入扫描排除 `project.inlang` 下的 cache（`cache/**`）与锁（`.lix/**`）。
 *
 * 真实输入：`messages/*.json` 与 `project.inlang` 自身文件（settings.json、
 * .meta.json、paraglide.config.ts 等）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MESSAGES_DIR = 'messages'
const INLANG_DIR = 'project.inlang'
const OUT_DIR = 'src/locale/paraglide'

/** 编译完成戳：成功编译后写入，天然位于 git 忽略的 node_modules 下。 */
const STAMP_PATH = join('node_modules', '.cache', 'locale-compile', 'stamp')

/** `project.inlang` 下属于缓存/锁、不算输入的目录名。 */
const INLANG_IGNORED_DIRS = new Set(['cache', '.lix'])

/** 递归取目录下所有文件的最新 mtime（毫秒）；目录不存在返回 0。 */
function newestMtime(dir: string, ignoreDirs: Set<string> = new Set()): number {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full, ignoreDirs))
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

/** 全部真实输入的最新 mtime（毫秒）；无输入时返回 0。 */
function newestInputMtime(root: string): number {
  return Math.max(
    newestMtime(join(root, MESSAGES_DIR)),
    newestMtime(join(root, INLANG_DIR), INLANG_IGNORED_DIRS),
  )
}

/**
 * 产物是否已是最新。
 * `root` 便于单测注入临时目录；默认即仓库根（相对 cwd）。
 */
export function isCompileUpToDate({ root = '.' }: { root?: string } = {}): boolean {
  // 产物缺失（如全新 clone）→ 必须编译。
  if (!existsSync(join(root, OUT_DIR, 'runtime.js'))) return false
  // stamp 缺失 → 从未成功编译过，必须编译。
  const stampPath = join(root, STAMP_PATH)
  if (!existsSync(stampPath)) return false
  const stampTime = statSync(stampPath).mtimeMs
  // stamp 严格晚于全部输入才算最新；相等（同毫秒）保守重编。
  return stampTime > newestInputMtime(root)
}

/** 编译成功后刷新 stamp（写入当前时间）。 */
function touchStamp(root = '.'): void {
  const stampPath = join(root, STAMP_PATH)
  mkdirSync(dirname(stampPath), { recursive: true })
  // writeFileSync 会把 mtime 置为当前时间，即「本次编译完成」的时刻。
  writeFileSync(stampPath, '')
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
    touchStamp()
  }
}
