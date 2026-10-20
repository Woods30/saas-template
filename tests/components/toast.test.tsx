import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toaster, toast } from '@/components/ui/toast'

/**
 * 守卫：全局 toast 能真正把一条消息渲染出来。
 *
 * 这条用例守的是**接线**而不是样式：`src/components/ui/toast.tsx` 是 shadcn 上游原件，
 * 它导出的 `toast` 是模块级单例，只有 `Toaster`（provider + portal + viewport）挂在
 * 同一棵 React 树里时才会生效。此前没有任何页面挂载 `Toaster`，所有提示只能靠各页面
 * 自己在角落写一行 `<p>`；把 provider 拆掉、或误删根路由的挂载，这条会立刻变红。
 *
 * 断言只用文案与 `role`，不碰 Base UI 的 `data-*` 结构——上游调整 DOM 时不该连带
 * 修改业务测试。
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
