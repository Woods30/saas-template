import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/notifications')({
  // 通知偏好整块依赖 newsletter 模块：模块关闭时该页与菜单项一并消失。
  beforeLoad: () => assertPageEnabled('newsletter'),
  head: () =>
    seo('/dashboard/notifications', {
      title: m.settings_notifications_title(),
      description: m.settings_notifications_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: NotificationsPage,
})

function NotificationsPage() {
  const { session } = Route.useRouteContext()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch(`/api/newsletter?email=${encodeURIComponent(session.user.email)}`)
    if (!response.ok) {
      setError(m.settings_error_generic())
      setSubscribed(false)
      return
    }
    const data = (await response.json()) as { subscribed?: boolean }
    setSubscribed(!!data.subscribed)
  }, [session.user.email])

  useEffect(() => {
    void load()
  }, [load])

  async function onToggle(next: boolean) {
    setPending(true)
    setError(null)
    const response = await fetch('/api/newsletter', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: session.user.email }),
    })
    setPending(false)
    if (!response.ok) {
      setError(m.settings_error_generic())
      return
    }
    setSubscribed(next)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {m.settings_notifications_title()}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.settings_notifications_description()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_notifications_subscribe_label()}</CardTitle>
          <CardDescription>{m.settings_notifications_subscribe_hint()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {subscribed === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <Field orientation="horizontal">
              <Switch
                id="newsletter-subscription"
                checked={subscribed}
                disabled={pending}
                onCheckedChange={onToggle}
              />
              <FieldLabel htmlFor="newsletter-subscription">
                {m.settings_notifications_subscribe_label()}
              </FieldLabel>
              <FieldDescription>{m.settings_notifications_subscribe_hint()}</FieldDescription>
            </Field>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
