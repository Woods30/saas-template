import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { websiteConfig } from '@/config/website'

/**
 * 品牌 Logo 的结构契约。
 *
 * 图形标记是静态资产，站名是**动态文本**。字标一旦烘焙进 SVG 的矢量路径，
 * 改配置也改不动它 —— 换了项目名，页头上还是旧品牌。
 */

/** 字标节点：带 `font-display` 的那个 span，与图形标记区分开。 */
function wordmarkOf(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('.font-display')
  if (!node) throw new Error('找不到字标节点')
  return node
}

describe('BrandLogo', () => {
  it('渲染配置里的站名', () => {
    const { container } = render(<BrandLogo />)

    // 双色字标把站名拆成两个 span，因此按整段文本比对而不是 getByText。
    expect(wordmarkOf(container).textContent).toBe(websiteConfig.metadata.name)
  })

  it('字标末尾的强调段用品牌紫，其余用墨色', () => {
    const original = websiteConfig.metadata
    // 强调段是站名的最后一段：各品牌的强调段不同（改过品牌就没了），
    // 所以这里自己摆一个站名与强调段，而不是依赖出厂值。
    websiteConfig.metadata = { ...original, name: 'Acme', logoAccent: 'e' }
    try {
      const { container } = render(<BrandLogo />)
      const wordmark = wordmarkOf(container)

      expect(wordmark.textContent).toBe('Acme')
      expect(wordmark.querySelector('.text-\\(--jbx-accent\\)')?.textContent).toBe('e')
    } finally {
      websiteConfig.metadata = original
    }
  })

  it('强调段为空时整串用墨色', () => {
    const original = websiteConfig.metadata
    websiteConfig.metadata = { ...original, logoAccent: '' }
    try {
      const { container } = render(<BrandLogo />)
      const wordmark = wordmarkOf(container)

      expect(wordmark.textContent).toBe(websiteConfig.metadata.name)
      expect(wordmark.querySelector('span')).toBeNull()
    } finally {
      websiteConfig.metadata = original
    }
  })

  it('图形标记对辅助技术隐藏，可访问名称由站名文字承担', () => {
    const { container } = render(<BrandLogo />)
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('role')).toBe('presentation')
    // 资产自带 aria-label="Jerbix icon"，留着会和站名冲突。
    expect(svg?.getAttribute('aria-label')).toBeNull()
  })

  it('字标不烘焙进 SVG：产物里没有矢量字形路径', () => {
    const { container } = render(<BrandLogo />)

    // 矢量字标是 `jerbix-wordmark` 那个 group；图形标记里没有它。
    expect(container.innerHTML).not.toContain('jerbix-wordmark')
  })

  it('图形标记仍然内联（CSS 变量要能穿透主题色）', () => {
    const { container } = render(<BrandLogo />)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.innerHTML).toContain('var(--jbx-mascot')
  })
})
