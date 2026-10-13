import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    // Always return success to prevent email enumeration
    await authClient.requestPasswordReset({
      email: String(form.get('email') ?? ''),
      redirectTo: '/auth/reset-password',
    })
    setSubmitting(false)
    setDone(true)
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.auth_forgot_title()}</CardTitle>
            <CardDescription>{m.auth_forgot_to_login()}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {typeof m.auth_forgot_success === 'function'
                ? m.auth_forgot_success()
                : '如果邮箱存在，重置链接已发送。'}
            </p>
            <Link
              to="/{-$locale}/auth/login"
              className="mt-4 block text-center text-sm text-muted-foreground underline"
            >
              {m.auth_forgot_to_login()}
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.auth_forgot_title()}</CardTitle>
          <CardDescription>{m.auth_forgot_to_login()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{m.auth_forgot_email_label()}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? '…' : m.auth_forgot_submit()}
            </Button>
            <Link
              to="/{-$locale}/auth/login"
              className="block text-center text-sm text-muted-foreground underline"
            >
              {m.auth_forgot_to_login()}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
