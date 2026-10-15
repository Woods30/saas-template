import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 主题令牌完整性守卫。
 *
 * `src/components/ui/sidebar.tsx` 引用了一批 `sidebar-*` 工具类（bg-sidebar、
 * border-sidebar-border…）。若 globals.css 未定义对应的裸变量与 `@theme inline`
 * 映射，Tailwind 会静默不生成这些类，侧栏就失去背景与边框——本测试把这条不变式
 * 钉死，防止令牌再次缺失。
 */
const globals = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf-8')
const sidebarSource = readFileSync(
  new URL('../../src/components/ui/sidebar.tsx', import.meta.url),
  'utf-8',
)

/** 需要存在裸变量 + @theme 映射的 sidebar 语义色。 */
const SIDEBAR_COLORS = [
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const

describe('sidebar 主题令牌', () => {
  it('每个 sidebar 语义色都有裸变量定义', () => {
    for (const name of SIDEBAR_COLORS) {
      expect(globals).toContain(`--${name}:`)
    }
  })

  it('每个 sidebar 语义色都有 @theme inline 的颜色映射', () => {
    for (const name of SIDEBAR_COLORS) {
      expect(globals).toContain(`--color-${name}: var(--${name});`)
    }
  })

  it('sidebar.tsx 引用的 sidebar 工具类都能被令牌覆盖', () => {
    // 从源码抽出 `bg-sidebar` / `text-sidebar-foreground` 这类工具类名。
    const used = new Set(
      [...sidebarSource.matchAll(/\b(?:bg|text|border|ring)-sidebar(?:-[a-z-]+)?\b/g)].map(
        (m) => m[0],
      ),
    )
    // 工具类名去掉前缀后即语义色名（bg-sidebar-accent → sidebar-accent）。
    const colors = [...used].map((cls) => cls.replace(/^(?:bg|text|border|ring)-/, ''))
    for (const color of colors) {
      expect(SIDEBAR_COLORS).toContain(color)
    }
  })
})
