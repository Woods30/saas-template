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
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/register')({
  beforeLoad: async () => {
    assertPageEnabled('auth')
    return fetchAuthProviderAvailability()
  },
  component: RegisterPage,
})

function RegisterPage() {
  const { google } = Route.useRouteContext()
  // `submitted` 保留为组件状态：它表达的是「已离开表单，进入结果页」，不是表单字段状态，
  // 放在 TanStack Form 里反而要绕着 form state 表达一次页面切换。
  // `serverError` 同 `login.tsx`：页面级提示不属于字段状态，见该文件的说明。
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
      })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.auth_error_generic())
        return
      }
      // 去向取决于是否要求邮箱验证，见 `src/auth/flow.ts`：
      // - 要求验证：注册成功**不等于**可登录，停在「请查收验证邮件」，否则用户会以为自己已登录；
      // - 不要求验证（邮件模块关闭）：better-auth 已经自动登录并下发会话，跳首页才是事实，
      //   此时提示「请查收邮件」会让用户去等一封永远不会到的信。
      if (signUpOutcome() === 'awaiting_verification') {
        setSubmitted(true)
        return
      }
      window.location.assign('/')
    },
  })

  function onGoogleClick() {
    void signIn.social({ provider: 'google', callbackURL: '/' })
  }

  if (submitted) {
    return (
      <AuthLayout title={m.auth_register_check_email_title()}>
        <p className="text-sm text-muted-foreground">{m.auth_register_check_email()}</p>
        <Link
          to="/{-$locale}/auth/login"
          className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
        >
          {m.auth_register_to_login()}
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={m.auth_register_title()} description={m.auth_register_to_login()}>
      {/* `noValidate` 见 `login.tsx` 的说明：原生约束校验会拦下 submit，让 schema 校验永远不跑。 */}
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
        className="mt-4 block text-center text-sm text-muted-foreground underline hover:text-foreground"
      >
        {m.auth_register_to_login()}
      </Link>
    </AuthLayout>
  )
}
