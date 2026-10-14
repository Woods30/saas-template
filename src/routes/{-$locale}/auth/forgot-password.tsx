import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { createForgotSchema } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { authFormMessages } from '@/components/auth/formMessages'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/forgot-password')({
  beforeLoad: () => assertPageEnabled('auth'),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  // `done` 表达「已离开表单，进入结果页」，`serverError` 是页面级提示——两者都不是字段状态，
  // 留在组件里（见 `login.tsx` 对 TanStack Form 1.33 错误入口的说明）。
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: createForgotSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      // 无论邮箱是否存在都返回成功，避免账号枚举；因此这里不看 `error`。
      // `redirectTo` 带上当前语言前缀，重置链接才能回到同一语言的页面。
      await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: `/${getRequestLocale()}/auth/reset-password`,
      })
      setDone(true)
    },
  })

  if (done) {
    return (
      <AuthLayout title={m.auth_forgot_title()}>
        <p className="text-sm text-muted-foreground">{m.auth_forgot_success()}</p>
        <Link
          to="/{-$locale}/auth/login"
          className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_forgot_to_login()}
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={m.auth_forgot_title()} description={m.auth_forgot_to_login()}>
      {/* `noValidate` 见 `login.tsx` 的说明：原生约束校验会拦下 submit，让 schema 校验永远不跑。 */}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="email">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_forgot_email_label()}
              type="email"
              autoComplete="email"
            />
          )}
        </form.Field>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <SubmitButton pending={isSubmitting}>{m.auth_forgot_submit()}</SubmitButton>
          )}
        </form.Subscribe>
        <Link
          to="/{-$locale}/auth/login"
          className="block text-center text-sm text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_forgot_to_login()}
        </Link>
      </form>
    </AuthLayout>
  )
}
