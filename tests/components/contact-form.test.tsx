import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from '@/components/contact/ContactForm'
import { toast } from '@/components/ui/toast'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 联系表单：成功走全局 toast，失败留在表单内 `role="alert"`；`<form noValidate>`，
 * 否则原生 email 校验会拦下 submit；提交按钮水合前禁用，避免退化为原生 GET。
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
 * 按可访问名称填字段。显式列名而不用 `getAllByRole('textbox')` 解构：
 * 后者依赖 DOM 顺序，字段调整顺序后会静默错位而测试仍全绿。
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
