import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { createResetSchema, MIN_PASSWORD_LENGTH } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { authFormMessages } from '@/components/auth/formMessages'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/reset-password')({
  beforeLoad: () => assertPageEnabled('auth'),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  // 页面级状态，不属于字段状态。
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [missingToken, setMissingToken] = useState(false)

  const form = useForm({
    defaultValues: { password: '' },
    validators: { onSubmit: createResetSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const token = new URLSearchParams(window.location.search).get('token')
      if (!token) {
        setMissingToken(true)
        return
      }
      const { error } = await authClient.resetPassword({ newPassword: value.password, token })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.auth_error_generic())
        return
      }
      setDone(true)
    },
  })

  if (done) {
    return (
      <AuthLayout title={m.auth_reset_title()}>
        <p className="text-sm text-muted-foreground">{m.auth_reset_success()}</p>
        <Link
          to="/{-$locale}/auth/login"
          className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_forgot_to_login()}
        </Link>
      </AuthLayout>
    )
  }

  if (missingToken) {
    return <Navigate to="/{-$locale}/auth/error" />
  }

  return (
    <AuthLayout title={m.auth_reset_title()} description={m.auth_forgot_to_login()}>
      {/* `noValidate` 见 `login.tsx` 的说明：原生约束校验会拦下 submit，让 schema 校验永远不跑。 */}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="password">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_reset_password_label()}
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
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
            <SubmitButton pending={isSubmitting}>{m.auth_reset_submit()}</SubmitButton>
          )}
        </form.Subscribe>
      </form>
    </AuthLayout>
  )
}
