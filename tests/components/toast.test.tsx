import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toaster, toast } from '@/components/ui/toast'

/**
 * 守卫全局 toast 的接线：`toast` 是模块级单例，只有 `Toaster` 挂在同一棵 React 树里
 * 才生效。断言只用文案与 `role`，不碰 Base UI 的 `data-*` 结构。
 */
describe('全局 toast', () => {
  it('挂载 Toaster 后 toast.add 能把标题与描述渲染出来', async () => {
    render(<Toaster />)

    act(() => {
      toast.add({ type: 'success', title: '已保存', description: '改动已经写入。' })
    })

    expect(await screen.findByText('已保存')).toBeInTheDocument()
    expect(screen.getByText('改动已经写入。')).toBeInTheDocument()
  })
})
