import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { m } from '@/locale/paraglide/messages.js'

interface ContactValues {
  name: string
  fromEmail: string
  subject: string
  message: string
}

const EMPTY: ContactValues = { name: '', fromEmail: '', subject: '', message: '' }

/**
 * 联系表单。
 *
 * 反馈分级严格遵循 `content/docs/forms.zh.md` 的分级表，与 `NewsletterCta` 一致：
 *
 * - **成功走全局 toast**——提交后表单被清空，结果与操作点之间没有稳定的承载位置；
 * - **失败留在表单内** `role="alert"`——用户要回头改输入，线索必须留在原地。
 *
 * 字段级校验交给服务端：`/api/contact` 用 `contactSchema` 校验并返回 400。客户端只做
 * 「非空 + 提交中」这一层，避免把 Zod 的英文默认消息带进界面（本仓 UI 全中文）。
 *
 * `<form noValidate>` 必填：`<Input type="email">` 会触发浏览器原生约束校验，值非法时
 * 原生校验直接拦下 `submit`，`onSubmit` 永远不会执行。
 */
export function ContactForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: EMPTY,
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        })
        if (!res.ok) {
          setServerError(m.contact_form_error())
          return
        }
        formApi.reset()
        toast.add({ type: 'success', title: m.contact_form_success() })
      } catch {
        setServerError(m.contact_form_error())
      }
    },
  })

  return (
    <section className="mx-auto max-w-xl px-6 pb-16">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{m.contact_form_name()}</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                autoComplete="name"
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="fromEmail">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{m.contact_form_email()}</FieldLabel>
              <Input
                id={field.name}
                type="email"
                value={field.state.value}
                autoComplete="email"
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="subject">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{m.contact_form_subject()}</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="message">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{m.contact_form_message()}</FieldLabel>
              <Textarea
                id={field.name}
                rows={6}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <SubmitButton pending={isSubmitting} pendingLabel={m.contact_form_pending()}>
              {m.contact_form_submit()}
            </SubmitButton>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}
