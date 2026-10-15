import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCompileUpToDate } from '../../scripts/locale-compile'

/**
 * locale 编译的幂等判定：输入（`messages/*.json`、`project.inlang` 自身文件）全部
 * 早于「编译完成戳」（stamp）时视为最新，跳过编译。这是消除串行链里重复编译的关键。
 *
 * 为什么用 stamp 而不是产物目录 mtime：paraglide 仅在内容变化时重写产物（`runtime.js`
 * 的 mtime 因此长期停滞），却每次都会刷新 `project.inlang/cache/paraglide-js/*.json`。
 * 该 cache 位于输入目录内，若把它算作输入，产物永远追不上，跳过判定会永久失效。
 * 故 stamp 记录「最近一次成功编译」，并把 cache / .lix 排除出输入扫描。
 *
 * 产物目录与 stamp 路径须与 `scripts/locale-compile.ts` 保持一致——`isCompileUpToDate`
 * 只接受 `root`，故临时根下必须复刻同一相对路径。
 */
const OUT_DIR = join('src', 'locale', 'paraglide')
const STAMP = join('node_modules', '.cache', 'locale-compile', 'stamp')

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'locale-compile-'))
  mkdirSync(join(root, 'messages'))
  mkdirSync(join(root, 'project.inlang'))
  mkdirSync(join(root, OUT_DIR), { recursive: true })
  writeFileSync(join(root, 'messages', 'zh.json'), '{}')
  writeFileSync(join(root, 'project.inlang', 'settings.json'), '{}')
  writeFileSync(join(root, OUT_DIR, 'runtime.js'), '// generated')
  return root
}

/** 写入 stamp（模拟一次成功编译），并把它设为 `t` 秒。 */
function writeStamp(root: string, t: number) {
  const stamp = join(root, STAMP)
  mkdirSync(join(stamp, '..'), { recursive: true })
  writeFileSync(stamp, '')
  utimesSync(stamp, t, t)
}

/** 以秒为单位设置文件 mtime。 */
function setTime(path: string, t: number) {
  utimesSync(path, t, t)
}

describe('isCompileUpToDate', () => {
  it('产物文件 mtime 陈旧但 stamp 比全部输入新时视为最新', () => {
    // 真实场景：paraglide 未重写 runtime.js（mtime 停滞），但确实编译过（stamp 新）。
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    setTime(join(root, 'messages', 'zh.json'), t - 200)
    setTime(join(root, 'project.inlang', 'settings.json'), t - 200)
    setTime(join(root, OUT_DIR, 'runtime.js'), t - 200)
    writeStamp(root, t - 100)
    expect(isCompileUpToDate({ root })).toBe(true)
  })

  it('输入比 stamp 新时视为需重编', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    writeStamp(root, t - 100)
    setTime(join(root, 'messages', 'zh.json'), t)
    expect(isCompileUpToDate({ root })).toBe(false)
  })

  it('stamp 缺失时视为需重编', () => {
    // 例如全新 clone：即便残留旧产物，也必须先编译一次再谈跳过。
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    setTime(join(root, 'messages', 'zh.json'), t - 100)
    setTime(join(root, 'project.inlang', 'settings.json'), t - 100)
    setTime(join(root, OUT_DIR, 'runtime.js'), t)
    expect(isCompileUpToDate({ root })).toBe(false)
  })

  it('产物文件缺失时视为需重编', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    setTime(join(root, 'messages', 'zh.json'), t - 100)
    setTime(join(root, 'project.inlang', 'settings.json'), t - 100)
    writeStamp(root, t)
    rmSync(join(root, OUT_DIR, 'runtime.js'))
    expect(isCompileUpToDate({ root })).toBe(false)
  })

  it('仅 project.inlang/cache 刷新时不触发重编', () => {
    // 复现粘滞缺陷：paraglide 每次编译都刷新 cache，但 cache 不是输入。
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    setTime(join(root, 'messages', 'zh.json'), t - 200)
    setTime(join(root, 'project.inlang', 'settings.json'), t - 200)
    setTime(join(root, OUT_DIR, 'runtime.js'), t - 200)
    writeStamp(root, t - 100)
    const cache = join(root, 'project.inlang', 'cache', 'paraglide-js')
    mkdirSync(cache, { recursive: true })
    const cacheFile = join(cache, 'abc123.json')
    writeFileSync(cacheFile, '{}')
    setTime(cacheFile, t)
    expect(isCompileUpToDate({ root })).toBe(true)
  })

  it('仅 project.inlang/.lix 刷新时不触发重编', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    setTime(join(root, 'messages', 'zh.json'), t - 200)
    setTime(join(root, 'project.inlang', 'settings.json'), t - 200)
    setTime(join(root, OUT_DIR, 'runtime.js'), t - 200)
    writeStamp(root, t - 100)
    const lix = join(root, 'project.inlang', '.lix')
    mkdirSync(lix, { recursive: true })
    const lock = join(lix, 'lock.json')
    writeFileSync(lock, '{}')
    setTime(lock, t)
    expect(isCompileUpToDate({ root })).toBe(true)
  })
})
