import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCompileUpToDate } from '../../scripts/locale-compile'

/**
 * locale 编译的幂等判定：输入（messages/*.json、project.inlang/**）全部早于产物
 * 时视为最新，跳过编译。这是消除串行链里重复 18s 编译的关键。
 *
 * 产物目录与 `scripts/locale-compile.ts` 的 `OUT_DIR`（`src/locale/paraglide`）
 * 保持一致——`isCompileUpToDate` 只接受 `root`，故临时根下必须复刻同一相对路径。
 */
const OUT_DIR = join('src', 'locale', 'paraglide')

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

describe('isCompileUpToDate', () => {
  it('产物比全部输入新时视为最新', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    utimesSync(join(root, 'messages', 'zh.json'), t - 100, t - 100)
    utimesSync(join(root, 'project.inlang', 'settings.json'), t - 100, t - 100)
    utimesSync(join(root, OUT_DIR, 'runtime.js'), t, t)
    expect(isCompileUpToDate({ root })).toBe(true)
  })

  it('输入比产物新时视为需重编', () => {
    const root = setup()
    const t = Math.floor(Date.now() / 1000)
    utimesSync(join(root, OUT_DIR, 'runtime.js'), t - 100, t - 100)
    utimesSync(join(root, 'messages', 'zh.json'), t, t)
    expect(isCompileUpToDate({ root })).toBe(false)
  })

  it('产物缺失时视为需重编', () => {
    const root = setup()
    expect(isCompileUpToDate({ root: join(root, 'nonexistent') })).toBe(false)
  })
})
