import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewsletterCta } from '@/components/sections/NewsletterCta'
import { toast } from '@/components/ui/toast'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 订阅块的**反馈分级**回归。
 *
 * 背景：各页面的「操作结果」提示走全局 toast（`src/routes/__root.tsx` 挂的
 * `Toaster`），`NewsletterCta` 是漏下的一个——它把成功送了 toast，失败却仍在表单下方
 * 渲染一行 `<p>`，而且那行渲染成 `订阅失败: 订阅失败`：`error` state 里存的就是
 * `m.newsletter_error()` 本身，模板里又拼了一次，同一句话出现两遍。
 *
 * 修正后沿用 `content/docs/forms.md` 的分级表（`users.tsx` 的 `run()` 同一套）：
 * **成功走 toast，失败留在表单内**。失败时用户要回头改邮箱，线索必须留在原地，
 * toast 一闪而过且出现位置离输入框远。
 *
 * 本测试守这条分级，不因下次「统一提示」的改动又把失败挪去 toast。
 */

const addSpy = vi.spyOn(toast, 'add')

beforeEach(() => {
  setLocale('zh', { reload: false })
  addSpy.mockClear()
})
afterEach(() => {
  setLocale('en', { reload: false })
  addSpy.mockClear()
  vi.unstubAllGlobals()
})

/** 把值写进非受控 input 并派发 input 事件，驱动 React 的状态更新。 */
function setInputValue(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 渲染、填邮箱、点提交，全部包在 act 里。 */
async function submit(email: string) {
  render(<NewsletterCta title="订阅更新" description="每月一封" />)
  const input = screen.getByRole('textbox')
  await act(async () => setInputValue(input, email))
  await act(async () => {
    screen.getByRole('button', { name: '订阅' }).click()
  })
  return screen.getByRole('button', { name: '订阅' })
}

function stubFetch(ok: boolean) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('NewsletterCta 反馈分级', () => {
  it('成功订阅走 toast', async () => {
    stubFetch(true)
    await submit('reader@example.com')

    await waitFor(() => expect(addSpy).toHaveBeenCalled())
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ type: 'success' })

    // 成功不在表单下留下任何内联提示。
    expect(document.querySelectorAll('.text-destructive')).toHaveLength(0)
  })

  it('订阅失败留在表单内的 role="alert"，不进 toast', async () => {
    stubFetch(false)
    await submit('reader@example.com')

    // 失败必须留在原地：用户要回头改邮箱，toast 出现的位置离输入框远且一闪而过。
    expect(await screen.findByRole('alert')).toHaveTextContent('订阅失败')
    expect(addSpy).not.toHaveBeenCalled()

    // 旧实现的直接证据：那行拼成 `{m.newsletter_error()}: {error}`，文案重复一遍。
    expect(screen.queryByText(/订阅失败: 订阅失败/)).not.toBeInTheDocument()
  })

  it('提交期间按钮保持禁用，防止重复订阅', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )

    render(<NewsletterCta title="订阅更新" />)
    const input = screen.getByRole('textbox')
    await act(async () => setInputValue(input, 'reader@example.com'))

    const button = screen.getByRole('button', { name: '订阅' })
    await act(async () => {
      button.click()
    })
    expect(button).toBeDisabled()

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({}) })
      await Promise.resolve()
    })
    // 成功后按钮必须解禁，否则用户改不了邮箱重试。
    expect(button).not.toBeDisabled()
  })
})
