import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { assertPageEnabled } from '@/lib/module-access'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/auth/error')({
  beforeLoad: () => assertPageEnabled('auth'),
  component: AuthErrorPage,
})

function AuthErrorPage() {
  return (
    <AuthLayout title={m.auth_error_title()} description={m.auth_error_message()}>
      <Link
        to="/{-$locale}/auth/login"
        className="block text-center text-sm text-muted-foreground underline hover:text-foreground"
      >
        {m.auth_error_back()}
      </Link>
    </AuthLayout>
  )
}
