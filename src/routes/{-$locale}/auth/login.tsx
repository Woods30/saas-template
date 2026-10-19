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
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/login')({
  beforeLoad: async () => {
    assertPageEnabled('auth')
    // 社交登录凭据是服务端 secret，客户端 bundle 读不到，因此经 server function 取；
    // SSR 阶段就地执行，客户端导航时降级为一次 RPC，两条路径结果一致。
    return fetchAuthProviderAvailability()
  },
  // 定价页在未登录时把用户送到这里并带上 `?redirect=/pricing`，登录后回到原处
  // 继续结账。只接受站内相对路径，避免开放重定向。
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const value = search.redirect
    if (typeof value !== 'string') return {}
    // 拒绝 `//evil.com`、`https://…` 与反斜杠变体（浏览器会把它当成 `//`）。
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return {}
    return { redirect: value }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const { google } = Route.useRouteContext()
  // 字段值、字段级校验错误、提交态全部由 TanStack Form 持有；`serverError` 是**页面级**提示，
  // 不是字段状态，TanStack Form 1.33 也没有「设置任意页面级错误」的类型安全入口
  // （`errorMap.onServer` 需要先声明 `onServer` validator 才可写），故仍用一个 `useState`。
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: createLoginSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { error } = await signIn.email({ email: value.email, password: value.password })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.auth_error_generic())
        return
      }
      trackLogin()
      // 登录后回来源页（定价页的结账引导会带 `?redirect=/pricing`）。
      // `validateSearch` 已挡掉 `//host` 之类的跨站路径，这里再判一次是纵深防御。
      window.location.assign(
        redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/',
      )
    },
  })

  function onGoogleClick() {
    // 失败时 better-auth 会带 `error` 查询参数重定向回本站；这里只在发起阶段兜底复位。
    void signIn.social({
      provider: 'google',
      callbackURL: redirect?.startsWith('/') ? redirect : '/',
    })
  }

  return (
    <AuthLayout title={m.auth_login_title()} description={m.auth_login_to_register()}>
      {/*
        `noValidate` 必填：`<Input type="email">` 会触发浏览器原生约束校验，值非法时
        原生校验会直接拦下 `submit`，`onSubmit` 永远不执行、schema 校验与错误文案也就
        永远不出现。校验权归 schema。
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
          className="text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_login_to_register_link()}
        </Link>
      </div>
    </AuthLayout>
  )
}
