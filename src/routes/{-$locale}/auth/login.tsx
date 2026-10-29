import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { signIn } from '@/auth/client'
import { fetchAuthProviderAvailability } from '@/auth/providers'
import { createLoginSchema } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { authFormMessages } from '@/components/auth/formMessages'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { trackLogin } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { resolveRedirectTarget, type SafeInternalPath, safeInternalPath } from '@/lib/urls'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/auth/login')({
  beforeLoad: async () => {
    assertPageEnabled('auth')
    // 社交登录凭据是服务端 secret，客户端读不到，必须经 server function 取。
    return fetchAuthProviderAvailability()
  },
  // 只接受站内相对路径，避免开放重定向。不能只查字符串前缀：浏览器解析前会
  // 剥离控制字符、把 `\` 当 `/`，故须走 `safeInternalPath`。
  validateSearch: (search: Record<string, unknown>): { redirect?: SafeInternalPath } => {
    const path = safeInternalPath(search.redirect)
    return path === undefined ? {} : { redirect: path }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const { google } = Route.useRouteContext()
  // `serverError` 是页面级提示而非字段状态，TanStack Form 1.33 无类型安全入口，
  // 故仍用 `useState`。
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: createLoginSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { error } = await signIn.email({
        email: value.email,
        password: value.password,
        callbackURL: `/${getLocale()}/auth/verify-email?redirect=${encodeURIComponent(resolveRedirectTarget(redirect))}`,
      })
      if (error) {
        setServerError(
          error.code === 'EMAIL_NOT_VERIFIED'
            ? m.auth_login_verify_required()
            : (error.message?.split('\n')[0] ?? m.auth_error_generic()),
        )
        return
      }
      trackLogin()
      // `validateSearch` 已过滤过，这里再走一次 `resolveRedirectTarget` 是纵深防御。
      window.location.assign(resolveRedirectTarget(redirect))
    },
  })

  function onGoogleClick() {
    void signIn.social({
      provider: 'google',
      callbackURL: resolveRedirectTarget(redirect),
    })
  }

  return (
    <AuthLayout title={m.auth_login_title()} description={m.auth_login_to_register()} legalNotice>
      {/*
        `noValidate` 必填：原生约束校验会拦下 `submit`，`onSubmit` 永不执行，
        schema 校验与错误文案也就永远不出现。
      */}
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
              label={m.auth_login_email_label()}
              type="email"
              autoComplete="email"
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <AuthFormField
              field={field}
              label={m.auth_login_password_label()}
              type="password"
              autoComplete="current-password"
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
            <SubmitButton pending={isSubmitting}>{m.auth_login_submit()}</SubmitButton>
          )}
        </form.Subscribe>
      </form>
      <SocialAuthButtons googleEnabled={google} onGoogleClick={onGoogleClick} />
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link
          to="/{-$locale}/auth/forgot-password"
          className="text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_login_to_forgot()}
        </Link>
        <Link
          to="/{-$locale}/auth/register"
          search={{ redirect }}
          className="text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_login_to_register_link()}
        </Link>
      </div>
    </AuthLayout>
  )
}
