/**
 * Paraglide 编译的幂等包装：输入未变时跳过编译。
 *
 * 判定用「编译完成戳」而非产物 mtime：paraglide 每次编译都会刷新
 * `project.inlang/cache`，拿产物 mtime 比输入 mtime 会永久失效。
 * 输入扫描排除 `project.inlang` 下的 cache 与 `.lix` 锁。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MESSAGES_DIR = 'messages'
const INLANG_DIR = 'project.inlang'
const OUT_DIR = 'src/locale/paraglide'

/** 编译完成戳；位于 git 忽略的 node_modules 下。 */
const STAMP_PATH = join('node_modules', '.cache', 'locale-compile', 'stamp')

/** `project.inlang` 下属于缓存/锁、不算输入的目录。 */
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

/** 产物是否已是最新；`root` 便于单测注入临时目录。 */
export function isCompileUpToDate({ root = '.' }: { root?: string } = {}): boolean {
  // 产物或 stamp 缺失（如全新 clone）→ 必须编译。
  if (!existsSync(join(root, OUT_DIR, 'runtime.js'))) return false
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
