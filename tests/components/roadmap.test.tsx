import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Roadmap } from '@/components/sections/Roadmap'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 路线图块的渲染回归。
 *
 * 断言只看**语义结构**（有序列表、标题、状态文案），不碰类名细节——样式调整不该
 * 连带修改业务测试。状态文案来自 `m.*()`，因此同时验证了本地化接线。
 */

beforeEach(() => setLocale('zh', { reload: false }))
afterEach(() => setLocale('en', { reload: false }))

const items = [
  { status: 'done' as const, title: '认证', description: '已完成的能力' },
  { status: 'active' as const, title: '通知', description: '正在做的能力' },
  { status: 'planned' as const, title: '存储', description: '计划中的能力' },
]

describe('Roadmap 块', () => {
  it('把每个条目渲染成有序列表项，并显示对应状态文案', () => {
    render(<Roadmap title="路线图" items={items} />)

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    expect(screen.getByText('认证')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('计划中')).toBeInTheDocument()
  })

  it('标题与副标题可选，未传时不渲染空标题', () => {
    render(<Roadmap items={items} />)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('eta 存在时渲染，缺失时不留下占位', () => {
    const { rerender } = render(
      <Roadmap items={[{ status: 'active', title: '通知', description: 'x', eta: '2026 Q2' }]} />,
    )
    expect(screen.getByText('2026 Q2')).toBeInTheDocument()

    rerender(<Roadmap items={[{ status: 'active', title: '通知', description: 'x' }]} />)
    expect(screen.queryByText('2026 Q2')).toBeNull()
  })

  it('状态文案随语言切换', () => {
    setLocale('en', { reload: false })
    render(<Roadmap items={[{ status: 'done', title: '认证', description: '已完成的能力' }]} />)
    expect(screen.getByText('Shipped')).toBeInTheDocument()
  })
})
