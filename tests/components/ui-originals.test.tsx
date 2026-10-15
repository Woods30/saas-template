import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * 守卫：这三个文件必须是 shadcn base-nova 上游原件，而非手写替代。
 *
 * base-nova 的契约特征（区别于旧版 new-york 手写版）：
 * - Card 根带 `data-slot="card"` 与 `--card-spacing` 变量、`rounded-xl`；
 * - Card 支持 `size` prop 并渲染 `data-size`；
 * - CardAction 存在且带 `data-slot="card-action"`；
 * - Input 渲染 `data-slot="input"`；
 * - Label 渲染 `data-slot="label"`。
 */
describe('ui 原件为 base-nova 风格', () => {
  it('Card 渲染 data-slot 与圆角，且支持 size prop', () => {
    render(
      <Card size="sm" data-testid="card">
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardAction>操作</CardAction>
        </CardHeader>
        <CardContent>内容</CardContent>
      </Card>,
    )
    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-slot', 'card')
    expect(card).toHaveAttribute('data-size', 'sm')
    expect(card.className).toContain('rounded-xl')
    expect(document.querySelector('[data-slot="card-action"]')).not.toBeNull()
  })

  it('Input 渲染 data-slot="input" 且为 base-nova 尺寸', () => {
    render(<Input aria-label="字段" />)
    const input = screen.getByLabelText('字段')
    expect(input).toHaveAttribute('data-slot', 'input')
    expect(input.className).toContain('h-8')
  })

  it('Label 渲染 data-slot="label"', () => {
    render(<Label>标签</Label>)
    expect(screen.getByText('标签')).toHaveAttribute('data-slot', 'label')
  })
})
