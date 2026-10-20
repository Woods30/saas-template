import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from '@/components/contact/ContactForm'
import { toast } from '@/components/ui/toast'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 联系表单的**反馈分级**回归。
 *
 * 分级规则来自 `content/docs/forms.zh.md`，与 `NewsletterCta` 同一套：
 * **成功走全局 toast，失败留在表单内** `role="alert"`。失败时用户要回头改输入，
 * 线索必须留在原地；toast 出现的位置离表单远且一闪而过。
 *
 * 同时守两条硬约束：
 * - `<form noValidate>`：`<Input type="email">` 的原生校验会拦下 `submit`，
 *   `onSubmit` 永远不执行（见 `content/docs/auth.zh.md`）；
 * - 提交按钮水合前禁用，避免点击退化为原生 GET 提交。
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

function setValue(element: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * 按可访问名称填三个 input 字段；留言是 textarea，单独填。
 *
 * 显式列出每条字段名而不是用 `getAllByRole('textbox')` 解构：后者依赖 DOM 顺序，
 * 而表单字段一旦调整顺序，解构出的值会静默错位到别的输入框里，测试仍然全绿。
 */
async function fillAndSubmit() {
  render(<ContactForm />)
  await act(async () => {
    setValue(screen.getByRole('textbox', { name: '姓名' }), '张三')
    setValue(screen.getByRole('textbox', { name: '邮箱' }), 'zhangsan@example.com')
    setValue(screen.getByRole('textbox', { name: '主题' }), '合作咨询')
    setValue(screen.getByRole('textbox', { name: '留言' }), '这是一条足够长的留言内容。')
  })
  await act(async () => {
    screen.getByRole('button', { name: '发送' }).click()
  })
}

describe('ContactForm 反馈分级', () => {
  it('提交成功走 toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
    )
    await fillAndSubmit()

    await waitFor(() => expect(addSpy).toHaveBeenCalled())
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ type: 'success' })
  })

  it('提交失败留在表单内的 role="alert"，不进 toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    )
    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('网络异常同样留在表单内', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
  })

  it('表单带 noValidate，避免原生校验拦下 submit', () => {
    const { container } = render(<ContactForm />)
    expect(container.querySelector('form')).toHaveAttribute('novalidate')
  })

  it('提交成功后清空字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
    )
    await fillAndSubmit()

    await waitFor(() => expect(addSpy).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: '姓名' })).toHaveValue('')
  })
})
