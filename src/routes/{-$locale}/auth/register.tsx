import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { signUp } from '@/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const { error: authError } = await signUp.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      name: String(form.get('name') ?? ''),
    })
    setSubmitting(false)
    if (authError) {
      setError(authError.message?.split('\n')[0] ?? '注册失败')
      return
    }
    window.location.assign('/')
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.auth_register_title()}</CardTitle>
          <CardDescription>{m.auth_register_to_login()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">{m.auth_register_name_label()}</Label>
              <Input id="name" name="name" type="text" required autoComplete="name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">{m.auth_register_email_label()}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{m.auth_register_password_label()}</Label>
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
              {submitting ? '…' : m.auth_register_submit()}
            </Button>
            <Link
              to="/{-$locale}/auth/login"
              className="block text-center text-sm text-muted-foreground underline"
            >
              {m.auth_register_to_login()}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
