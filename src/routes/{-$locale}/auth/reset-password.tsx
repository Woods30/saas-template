import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) {
      setError('缺少重置令牌')
      setSubmitting(false)
      return
    }
    const { error: authError } = await authClient.resetPassword({
      newPassword: String(form.get('password') ?? ''),
      token,
    })
    setSubmitting(false)
    if (authError) {
      setError(authError.message?.split('\n')[0] ?? '重置失败')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.auth_reset_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {typeof m.auth_reset_success === 'function'
                ? m.auth_reset_success()
                : '密码已重置，请登录。'}
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
          <CardTitle>{m.auth_reset_title()}</CardTitle>
          <CardDescription>{m.auth_login_to_register()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">{m.auth_reset_password_label()}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? '…' : m.auth_reset_submit()}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
