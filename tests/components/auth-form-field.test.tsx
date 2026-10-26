import { useForm } from '@tanstack/react-form'
import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it } from 'vitest'
import { createLoginSchema } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'

/** TanStack Form 与 shadcn `Field` 的薄适配层：只接线 `field.state`，不自建输入控件。 */
const msg = {
  required: '此项为必填。',
  emailInvalid: '邮箱格式不正确。',
  passwordTooShort: '密码太短。',
}

/** 用真实 `useForm` + zod schema 驱动，断言实际接线的形状。 */
function Harness() {
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: createLoginSchema(msg) },
  })
  return (
    // `noValidate` 必填：原生约束校验会拦下 submit，`onSubmit` 永不执行。
    <form
      noValidate
      onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => <AuthFormField field={field} label="邮箱" type="email" />}
      </form.Field>
      <button type="submit">提交</button>
    </form>
  )
}

describe('AuthFormField', () => {
  it('初始无错误：不标记 aria-invalid，也不渲染错误文案', () => {
    render(<Harness />)
    const input = screen.getByLabelText('邮箱')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('提交非法值后：标记 aria-invalid，渲染错误文案，并与输入框关联', async () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    // 先等错误出现（校验是异步的），再断言输入框状态。
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('邮箱格式不正确。')

    const input = screen.getByLabelText('邮箱')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toBe(alert)
  })

  it('label 与 input 正确关联，且输入受 TanStack Form 驱动', () => {
    render(<Harness />)

    const input = screen.getByLabelText('邮箱')
    expect(input).toHaveAttribute('id', 'email')
    fireEvent.change(input, { target: { value: 'user@example.com' } })
    expect(input).toHaveValue('user@example.com')
  })
})
