import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCompileUpToDate } from '../../scripts/locale-compile'

/**
 * locale 编译的幂等判定：输入全部早于编译完成戳（stamp）时跳过编译。
 *
 * 不能用产物 mtime：paraglide 每次编译都刷新 `project.inlang/cache`（位于输入目录内），
 * 产物永远追不上，跳过判定会永久失效。临时根下须复刻脚本里的相对路径。
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

/** 写入 stamp 并设为 `t` 秒，模拟一次成功编译。 */
function writeStamp(root: string, t: number) {
  const stamp = join(root, STAMP)
  mkdirSync(join(stamp, '..'), { recursive: true })
  writeFileSync(stamp, '')
  utimesSync(stamp, t, t)
}

/** 设置文件 mtime（秒）。 */
function setTime(path: string, t: number) {
  utimesSync(path, t, t)
}

describe('isCompileUpToDate', () => {
  it('产物文件 mtime 陈旧但 stamp 比全部输入新时视为最新', () => {
    // paraglide 未重写 runtime.js，但确实编译过（stamp 新）。
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
    // 全新 clone：即便残留旧产物，也必须先编译一次。
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
    // paraglide 每次编译都刷新 cache，但 cache 不是输入。
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
