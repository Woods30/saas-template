import { useForm } from '@tanstack/react-form'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { createChangeEmailSchema, createChangePasswordSchema } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { authFormMessages } from '@/components/auth/formMessages'
import { SubmitButton } from '@/components/auth/SubmitButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { destructiveFocusRing } from '@/lib/a11y'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/security')({
  head: () =>
    seo('/dashboard/security', {
      title: m.settings_security_title(),
      description: m.settings_security_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: SecurityPage,
})

function SecurityPage() {
  const { session } = Route.useRouteContext()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.settings_security_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_security_description()}</p>
      </div>
      <ChangePasswordCard />
      <ChangeEmailCard currentEmail={session.user.email} />
      <DeleteAccountCard />
    </div>
  )
}

function ChangePasswordCard() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const form = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
    validators: { onSubmit: createChangePasswordSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      setSaved(false)
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.settings_error_generic())
        return
      }
      setSaved(true)
      form.reset()
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.settings_security_password_title()}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="currentPassword">
            {(field) => (
              <AuthFormField
                field={field}
                label={m.settings_security_current_password_label()}
                type="password"
                autoComplete="current-password"
              />
            )}
          </form.Field>
          <form.Field name="newPassword">
            {(field) => (
              <AuthFormField
                field={field}
                label={m.settings_security_new_password_label()}
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              {m.settings_security_password_success()}
            </p>
          )}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <SubmitButton pending={isSubmitting}>
                {m.settings_security_password_submit()}
              </SubmitButton>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  )
}

function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const form = useForm({
    defaultValues: { newEmail: '' },
    validators: { onSubmit: createChangeEmailSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      setSent(false)
      const { error } = await authClient.changeEmail({
        newEmail: value.newEmail,
        callbackURL: '/',
      })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.settings_error_generic())
        return
      }
      setSent(true)
      form.reset()
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.settings_security_email_title()}</CardTitle>
        <CardDescription>{currentEmail}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="newEmail">
            {(field) => (
              <AuthFormField
                field={field}
                label={m.settings_security_new_email_label()}
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
          {sent && (
            <p role="status" className="text-sm text-muted-foreground">
              {m.settings_security_email_sent()}
            </p>
          )}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <SubmitButton pending={isSubmitting}>
                {m.settings_security_email_submit()}
              </SubmitButton>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteAccountCard() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  async function onConfirm() {
    setServerError(null)
    const { error } = await authClient.deleteUser()
    if (error) {
      setServerError(error.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    // 账号已删除，会话失效；回到首页并刷新，让导航栏重新读取会话。
    window.location.assign('/')
    void router.invalidate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.settings_security_delete_title()}</CardTitle>
        <CardDescription>{m.settings_security_delete_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        {serverError && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {serverError}
          </p>
        )}
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button type="button" variant="destructive" className={destructiveFocusRing} />}
          >
            {m.settings_security_delete_button()}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.settings_security_delete_confirm_title()}</AlertDialogTitle>
              <AlertDialogDescription>
                {m.settings_security_delete_confirm_description()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.settings_security_delete_cancel()}</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>
                {m.settings_security_delete_confirm_button()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
