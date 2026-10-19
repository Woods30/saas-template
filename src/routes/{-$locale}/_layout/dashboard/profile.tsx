import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { createProfileSchema } from '@/auth/validation'
import { AuthFormField } from '@/components/auth/AuthFormField'
import { authFormMessages } from '@/components/auth/formMessages'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/profile')({
  head: () => {
    const base = seo('/dashboard/profile', {
      title: m.settings_profile_title(),
      description: m.settings_profile_description(),
      locale: getRequestLocale(),
    })
    // 个人页不应被搜索引擎索引，在通用 meta 之后追加 robots 指令。
    return { ...base, meta: [...base.meta, { name: 'robots', content: 'noindex' }] }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { session } = Route.useRouteContext()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  const form = useForm({
    defaultValues: { name: session.user.name },
    validators: { onSubmit: createProfileSchema(authFormMessages()) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      setSaved(false)
      const { error } = await authClient.updateUser({ name: value.name })
      if (error) {
        setServerError(error.message?.split('\n')[0] ?? m.settings_error_generic())
        return
      }
      setSaved(true)
    },
  })

  async function onSendVerification() {
    setServerError(null)
    const { error } = await authClient.sendVerificationEmail({
      email: session.user.email,
      callbackURL: '/',
    })
    if (error) {
      setServerError(error.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    setVerificationSent(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.settings_profile_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_profile_description()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_profile_name_label()}</CardTitle>
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
            <form.Field name="name">
              {(field) => (
                <AuthFormField
                  field={field}
                  label={m.settings_profile_name_label()}
                  type="text"
                  autoComplete="name"
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
                {m.settings_profile_name_success()}
              </p>
            )}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <SubmitButton pending={isSubmitting}>
                  {m.settings_profile_name_submit()}
                </SubmitButton>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_profile_email_label()}</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge variant={session.user.emailVerified ? 'default' : 'secondary'}>
            {session.user.emailVerified
              ? m.settings_profile_email_verified()
              : m.settings_profile_email_unverified()}
          </Badge>
          {!session.user.emailVerified && (
            <Button type="button" variant="outline" size="sm" onClick={onSendVerification}>
              {m.settings_profile_send_verification()}
            </Button>
          )}
          {verificationSent && (
            <span role="status" className="text-sm text-muted-foreground">
              {m.settings_profile_verification_sent()}
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
