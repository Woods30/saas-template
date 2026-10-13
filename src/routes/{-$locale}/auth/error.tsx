import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/error')({
  component: AuthErrorPage,
})

function AuthErrorPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.auth_error_title()}</CardTitle>
          <CardDescription>{m.auth_error_back()}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {typeof m.auth_error_message === 'function'
              ? m.auth_error_message()
              : m.auth_error_message}
          </p>
          <Link
            to="/{-$locale}/auth/login"
            className="mt-4 block text-center text-sm text-muted-foreground underline"
          >
            {m.auth_error_back()}
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
