import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 测试分组接线守卫：vitest.workspace.ts 曾被废弃但无人引用，`pnpm test` 漏跑
 * tests/components。用源码断言钉死「两组都在 projects 里」且死配置已删除。
 */
const root = new URL('../../', import.meta.url)
const vitestConfig = readFileSync(new URL('vitest.config.ts', root), 'utf-8')
const componentsConfig = readFileSync(new URL('vitest.components.config.ts', root), 'utf-8')

describe('vitest projects', () => {
  it('vitest.config.ts 声明了 projects 且含 components 组', () => {
    expect(vitestConfig).toContain('projects:')
    expect(vitestConfig).toContain('vitest.components.config.ts')
  })

  it('unit 组在 projects 内联声明', () => {
    expect(vitestConfig).toContain("name: 'unit'")
  })

  it('components 组带 name: components', () => {
    expect(componentsConfig).toContain("name: 'components'")
  })

  it('失效的 vitest.workspace.ts 已删除', () => {
    expect(existsSync(new URL('vitest.workspace.ts', root))).toBe(false)
  })
})
