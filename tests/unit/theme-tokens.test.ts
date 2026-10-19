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

/**
 * 层次守卫。
 *
 * 主题的价值不在单个色值，而在**明暗层次**：侧栏、页面底、卡片必须各占一档。
 * 曾经 `--sidebar` 直接转发 `--card`，侧栏与卡片同色、内容区与侧栏同色，整页
 * 看起来是一块平面——这类回退不会让任何断言失败，只能在截图里发现。
 *
 * 这里把四条不变式钉死：
 * 1. `--sidebar` 不再转发其它令牌（必须是自己的 light-dark 取值）；
 * 2. `--sidebar` 与 `--background` 同档（导出稿如此），与卡片差一档；
 * 3. 侧栏与页面底同色时，`--sidebar-border` 必须独立取值，否则侧栏没有边界；
 * 4. `--highlight` 存在且与 `--accent` 分离（主题的 accent 是中性面，不能当强调色）。
 */

/** 从 globals.css 取出某个令牌的 `light-dark(明, 暗)` 两值，返回 oklch 的 L。 */
function lightnessPair(token: string): { light: number; dark: number } {
  const pattern = new RegExp(`--${token}:\\s*light-dark\\(\\s*oklch\\(([\\d.]+)`, 'm')
  const match = globals.match(pattern)
  if (!match) throw new Error(`globals.css 中找不到 --${token} 的 light-dark() 声明`)
  const light = Number(match[1])
  const darkMatch = globals
    .slice(match.index)
    .match(/^--[\w-]+:\s*light-dark\([^,]+,\s*oklch\(([\d.]+)/m)
  if (!darkMatch) throw new Error(`--${token} 的 light-dark() 缺少深色取值`)
  return { light, dark: Number(darkMatch[1]) }
}

describe('主题层次', () => {
  it('--sidebar 有自己的取值，不转发 --card', () => {
    expect(globals).not.toMatch(/--sidebar:\s*var\(--card\)/)
    expect(globals).toMatch(/--sidebar:\s*light-dark\(/)
  })

  // 导出稿的层次是「侧栏与页面底同色，靠 1px 描边分界」，卡片再亮一档。
  // 因此这里只要求 `card > sidebar`——早先为了做纵深把 sidebar 压暗一档，
  // 结果与 tweakcn 预览对不上，已改回导出稿取值。
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('%s 下 card > sidebar（侧栏与页面底同色）', (_label, mode) => {
    const card = lightnessPair('card')[mode]
    const bg = lightnessPair('background')[mode]
    const sidebar = lightnessPair('sidebar')[mode]
    expect(card).toBeGreaterThan(sidebar)
    // 侧栏与页面底取同一档明度：相等是设计意图，不是漏改。
    expect(sidebar).toBe(bg)
  })

  it('侧栏靠 sidebar-border 与内容区分界', () => {
    // 侧栏与页面底同色时，描边是唯一的分界手段——它必须独立取值，
    // 转发成 var(--background) 就等于没有边框。
    expect(globals).toMatch(/--sidebar-border:\s*light-dark\(/)
    expect(globals).not.toMatch(/--sidebar-border:\s*var\(--background\)/)
  })

  it('--highlight 独立于 --accent，且已映射为工具类', () => {
    // 主题的 --accent 是菜单 hover 用的中性面；装饰元素若沿用它会在两种主题下变灰。
    expect(globals).toMatch(/--highlight:\s*light-dark\(/)
    expect(globals).toContain('--color-highlight: var(--highlight);')
    expect(globals).not.toMatch(/--highlight:\s*var\(--accent\)/)
  })
})

/**
 * tweakcn 导出稿的其余 token。
 *
 * 导出稿（主题 `cmvd8fl4i000104l4ctz6amjc`）除颜色外还带字体族、字距、`chart-*`
 * 序列色与 `destructive-foreground`。这些在本仓不是「可选的补充」——缺了它们，
 * 组件会退回 Tailwind 默认值（系统字体、`--tracking-normal: 0`），页面与导出稿
 * 的观感就会分叉，而这类缺失**不会让任何现有断言失败**。这里逐项钉死。
 */
const DERIVED_COLORS = [
  'destructive-foreground',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
]

describe('导出稿的派生 token', () => {
  it.each(DERIVED_COLORS)('--%s 有裸变量与工具类映射', (name) => {
    expect(globals).toContain(`--${name}:`)
    expect(globals).toContain(`--color-${name}: var(--${name});`)
  })

  it('字体族与字距来自导出稿，且含中日韩后备字体', () => {
    // 主题字体是拉丁专用的：没有 CJK 后备项时，中文会落到浏览器默认字体。
    expect(globals).toContain('--font-sans:')
    expect(globals).toMatch(/--font-sans:[\s\S]*?PingFang SC/)
    expect(globals).toMatch(/--font-mono:[\s\S]*?JetBrains Mono/)
    expect(globals).toContain('--tracking-normal: -0.01em;')
  })

  it('body 应用了主题字体与字距', () => {
    expect(globals).toMatch(/body\s*\{[\s\S]*?font-family:\s*var\(--font-sans\)/)
    expect(globals).toMatch(/body\s*\{[\s\S]*?letter-spacing:\s*var\(--tracking-normal\)/)
  })
})
