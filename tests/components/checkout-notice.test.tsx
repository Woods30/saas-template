import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/toast'
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'

/**
 * 结账回跳提示的幂等性。
 *
 * 回归：TanStack Start 的 hydration 流程会让组件的 effect 重跑一次，裸
 * `toast.add` 于是弹两次「支付成功」。这里用 `<StrictMode>` 稳定复现同一行为
 * —— React 19 在 StrictMode 下也会重跑 effect，且 `useRef` 的值在两次之间保留，
 * 与生产环境的观测一致。
 *
 * `Toaster` 必须是 `Probe` 的**兄弟**而非父节点：`ToastProvider` 靠 effect 订阅
 * 全局 toast 单例，而 React 的 effect 顺序是子先于父，嵌套时订阅还没建立，
 * 提示就丢了。
 */
describe('结账回跳提示', () => {
  it('同一个 checkout 信号只提示一次', async () => {
    const clearUrl = vi.fn()
    function Probe() {
      useCheckoutNotice({
        checkout: 'success',
        type: 'success',
        title: '支付成功',
        clearUrl,
      })
      return null
    }

    render(
      <>
        <Toaster />
        <StrictMode>
          <Probe />
        </StrictMode>
      </>,
    )

    expect(await screen.findAllByText('支付成功')).toHaveLength(1)
  })

  it('提示后清掉 URL 上的 checkout 参数', () => {
    const clearUrl = vi.fn()
    function Probe() {
      useCheckoutNotice({
        checkout: 'success',
        type: 'success',
        title: '支付成功',
        clearUrl,
      })
      return null
    }

    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    )

    expect(clearUrl).toHaveBeenCalledTimes(1)
  })

  it('没有 checkout 信号时不提示也不清 URL', () => {
    const clearUrl = vi.fn()
    function Probe() {
      useCheckoutNotice({
        checkout: undefined,
        type: 'success',
        title: '支付成功',
        clearUrl,
      })
      return null
    }

    render(
      <>
        <Toaster />
        <StrictMode>
          <Probe />
        </StrictMode>
      </>,
    )

    expect(screen.queryByText('支付成功')).toBeNull()
    expect(clearUrl).not.toHaveBeenCalled()
  })

  it('信号从有变为无后不再提示', async () => {
    const clearUrl = vi.fn()
    function Probe({ checkout }: { checkout: 'success' | undefined }) {
      useCheckoutNotice({
        checkout,
        type: 'success',
        title: '支付成功',
        clearUrl,
      })
      return null
    }

    const { rerender } = render(
      <>
        <Toaster />
        <StrictMode>
          <Probe checkout="success" />
        </StrictMode>
      </>,
    )

    expect(await screen.findAllByText('支付成功')).toHaveLength(1)

    act(() => {
      rerender(
        <>
          <Toaster />
          <StrictMode>
            <Probe checkout={undefined} />
          </StrictMode>
        </>,
      )
    })

    expect(screen.getAllByText('支付成功')).toHaveLength(1)
    expect(clearUrl).toHaveBeenCalledTimes(1)
  })
})
