import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 测试分组接线守卫。
 *
 * 此前 vitest.workspace.ts 无人引用（vitest 5 已废弃该文件），`pnpm test` 实际
 * 只跑 tests/unit，tests/components 被漏掉。改用 test.projects 后，本测试以源码
 * 断言钉死「两组都在 projects 里」且「死配置已删除」，防止回归。
 *
 * 用源码断言而非 import 配置：配置模块带解析副作用，且 repo 既有守卫测试
 * （brand-config.test.ts）同样读源码。
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
