import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DocsToc } from '@/components/docs/DocsToc'

/**
 * 右侧「本页目录」。
 *
 * 目录项是纯锚点链接（`#id`），不是路由跳转——它只在当前页内滚动，因此不依赖
 * TanStack Router，可独立测试。
 */

afterEach(() => {
  document.body.innerHTML = ''
})

const HEADINGS = [
  { id: '准备开发环境', text: '准备开发环境', level: 2 as const },
  { id: '安装依赖', text: '安装依赖', level: 3 as const },
  { id: '部署', text: '部署', level: 2 as const },
]

describe('DocsToc', () => {
  it('渲染带可访问名的「本页目录」导航', () => {
    render(<DocsToc headings={HEADINGS} />)
    // 组件测试环境 locale 为 en，文案取英文键。
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeTruthy()
  })

  it('每个标题渲染为指向其锚点的链接', () => {
    render(<DocsToc headings={HEADINGS} />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '#准备开发环境',
      '#安装依赖',
      '#部署',
    ])
    expect(links.map((l) => l.textContent)).toEqual(['准备开发环境', '安装依赖', '部署'])
  })

  it('h3 比 h2 缩进更深，体现层级', () => {
    render(<DocsToc headings={HEADINGS} />)
    const [, h3] = screen.getAllByRole('link')
    expect(h3?.getAttribute('data-level')).toBe('3')
  })

  it('无标题时不渲染（避免留下一个空壳侧栏）', () => {
    const { container } = render(<DocsToc headings={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
