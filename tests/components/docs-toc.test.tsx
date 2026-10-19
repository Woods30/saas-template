import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

/**
 * 让 `id` 对应元素的顶边落在 `top` 像素处。
 *
 * 重复调用是**移动**而不是再插一个：同 id 插两份时 `getElementById` 永远返回第一个，
 * 后一次的坐标就测不到了。
 */
function placeHeading(id: string, top: number) {
  const element = document.getElementById(id) ?? document.createElement('h2')
  element.id = id
  element.getBoundingClientRect = () =>
    ({ top, bottom: top + 40, height: 40, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect
  if (!element.isConnected) document.body.appendChild(element)
}

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

  it('h3 比 h2 缩进更深，并用短横线接回竖线', () => {
    render(<DocsToc headings={HEADINGS} />)
    const [, h3] = screen.getAllByRole('link')
    expect(h3?.getAttribute('data-level')).toBe('3')
    // 竖线缩进：h2 用 pl-3，h3 用 pl-5；h3 所在行另有一条连接线。
    const h2 = screen.getAllByRole('link')[0]
    expect(h2?.className).toContain('pl-3')
    expect(h3?.className).toContain('pl-5')
    // 连接线是 h3 专属的（当前项高亮段另有 `data-active-bar`，不在此断言内）。
    const connectors = [...document.querySelectorAll('li > span[data-connector]')]
    expect(connectors).toHaveLength(1)
    expect(h3?.closest('li')?.contains(connectors[0] ?? null)).toBe(true)
    expect(h2?.closest('li')?.querySelector('span[data-connector]')).toBeNull()
  })

  it('无标题时不渲染（避免留下一个空壳侧栏）', () => {
    const { container } = render(<DocsToc headings={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

/**
 * 当前小节高亮。
 *
 * jsdom 不做布局，`getBoundingClientRect().top` 恒为 0——因此这里改为显式桩掉
 * `getBoundingClientRect`，让「某个标题已滚过阈值」这件事可测。
 */
describe('DocsToc 当前小节高亮', () => {
  it('滚动后点亮最后一个已越过的标题，其余保持普通态', () => {
    placeHeading('准备开发环境', -400)
    // 第二节仍在阈值下方（`ACTIVE_OFFSET_PX` = 120），因此初始应点亮第一节。
    placeHeading('安装依赖', 600)
    placeHeading('部署', 900)

    render(<DocsToc headings={HEADINGS} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('aria-current', 'location')
    expect(links[1]).not.toHaveAttribute('aria-current')
    expect(links[2]).not.toHaveAttribute('aria-current')

    // 滚到「安装依赖」也越过阈值，高亮随之下移。
    placeHeading('安装依赖', -200)
    fireEvent.scroll(window)

    return waitFor(() => {
      expect(screen.getAllByRole('link')[1]).toHaveAttribute('aria-current', 'location')
      expect(screen.getAllByRole('link')[0]).not.toHaveAttribute('aria-current')
    })
  })

  it('高亮项用强调色 + 加粗，并把竖线那一段点亮', () => {
    placeHeading('准备开发环境', -400)
    placeHeading('安装依赖', 600)
    placeHeading('部署', 900)

    render(<DocsToc headings={HEADINGS} />)
    const [active, inactive] = screen.getAllByRole('link')
    // 只换颜色在浅色主题下辨识度不足，参考站同时高亮竖线。
    expect(active?.className).toContain('text-primary')
    expect(active?.className).toContain('font-medium')
    expect(inactive?.className).toContain('text-muted-foreground')
    expect(inactive?.className).toContain('font-normal')
    // 高亮段只在当前项那一行出现，且压在竖线上（`-left-px` + 竖条宽度）。
    const bar = active?.closest('li')?.querySelector('span[data-active-bar]')
    expect(bar?.className).toContain('bg-primary')
    expect(bar?.className).toContain('-left-px')
    expect(bar?.className).toContain('w-0.5')
    expect(inactive?.closest('li')?.querySelector('span[data-active-bar]')).toBeNull()
  })
})

describe('DocsToc 当前项的连接线', () => {
  it('当前项是 h3 时，它的短横线也换成强调色', () => {
    // 让 h3（第二节）成为当前项。
    placeHeading('准备开发环境', -400)
    placeHeading('安装依赖', -200)
    placeHeading('部署', 900)

    render(<DocsToc headings={HEADINGS} />)
    const [, activeH3] = screen.getAllByRole('link')
    const connector = activeH3?.closest('li')?.querySelector('span[data-connector]')
    // 竖线已高亮，接出来的横线若仍是灰色会断成一截。
    expect(connector?.className).toContain('bg-primary')

    const inactiveConnector = screen
      .getAllByRole('link')[2]
      ?.closest('li')
      ?.querySelector('span[data-connector]')
    expect(inactiveConnector).toBeNull()
  })

  it('当前项是 h2 时，h3 的连接线保持灰色', () => {
    placeHeading('准备开发环境', -400)
    placeHeading('安装依赖', 600)
    placeHeading('部署', 900)

    render(<DocsToc headings={HEADINGS} />)
    const connector = screen
      .getAllByRole('link')[1]
      ?.closest('li')
      ?.querySelector('span[data-connector]')
    expect(connector?.className).toContain('bg-border')
  })
})
