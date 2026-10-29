import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { signIn, signUp } from '@/auth/client'
import { signUpOutcome } from '@/auth/flow'
import { fetchAuthProviderAvailability } from '@/auth/providers'
import { createRegisterSchema, MIN_PASSWORD_LENGTH } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { authFormMessages } from '@/components/auth/formMessages'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { trackSignUp } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { resolveRedirectTarget, type SafeInternalPath, safeInternalPath } from '@/lib/urls'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/auth/register')({
  beforeLoad: async () => {
    assertPageEnabled('auth')
    return fetchAuthProviderAvailability()
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { plan?: string; redirect?: SafeInternalPath } => ({
    ...(typeof search.plan === 'string' ? { plan: search.plan } : {}),
    ...(safeInternalPath(search.redirect) ? { redirect: safeInternalPath(search.redirect) } : {}),
  }),
  component: RegisterPage,
})

function RegisterPage() {
  const { redirect } = Route.useSearch()
  const { google } = Route.useRouteContext()
  // `submitted` 与 `serverError` 是页面级状态，不属于字段状态，故不放进 TanStack Form。
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: createRegisterSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { error } = await signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
        callbackURL: `/${getLocale()}/auth/verify-email?redirect=${encodeURIComponent(resolveRedirectTarget(redirect))}`,
      })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.auth_error_generic())
        return
      }
      // 要求验证时注册成功不等于可登录；不要求时 better-auth 已自动登录。
      if (signUpOutcome() === 'awaiting_verification') {
        // 埋点在两个分支都发：等待验证也算完成注册。
        trackSignUp()
        setSubmitted(true)
        return
      }
      trackSignUp()
      window.location.assign(resolveRedirectTarget(redirect))
    },
  })

  function onGoogleClick() {
    void signIn.social({ provider: 'google', callbackURL: resolveRedirectTarget(redirect) })
  }

  if (submitted) {
    return (
      <AuthLayout title={m.auth_register_check_email_title()}>
        <p className="text-sm text-muted-foreground">{m.auth_register_check_email()}</p>
        <Link
          to="/{-$locale}/auth/login"
          search={{ redirect }}
          className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_register_to_login()}
        </Link>
      </AuthLayout>
    )
  }

  return (
    // 只有表单这一支传 `legalNotice`：结果页里账号已创建、同意已发生。
    <AuthLayout
      title={m.auth_register_title()}
      description={m.auth_register_to_login()}
      legalNotice
    >
      {/* `noValidate`：原生约束校验会拦下 submit，让 schema 校验永远不跑。 */}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_register_name_label()}
              type="text"
              autoComplete="name"
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_register_email_label()}
              type="email"
              autoComplete="email"
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_register_password_label()}
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
            <SubmitButton pending={isSubmitting}>{m.auth_register_submit()}</SubmitButton>
          )}
        </form.Subscribe>
      </form>
      <SocialAuthButtons googleEnabled={google} onGoogleClick={onGoogleClick} />
      <Link
        to="/{-$locale}/auth/login"
        search={{ redirect }}
        className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
      >
        {m.auth_register_to_login()}
      </Link>
    </AuthLayout>
  )
}
