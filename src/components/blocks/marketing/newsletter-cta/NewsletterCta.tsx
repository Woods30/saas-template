import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { m } from '@/locale/paraglide/messages.js'
import type { NewsletterCtaProps } from './types'

export function NewsletterCta({
  title,
  description,
  placeholder = 'you@example.com',
  successMessage,
}: NewsletterCtaProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      <form
        className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        onSubmit={async (e) => {
          e.preventDefault()
          setStatus('loading')
          const email = (new FormData(e.currentTarget).get('email') as string) ?? ''
          try {
            const res = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            if (!res.ok) {
              setStatus('error')
              setError(m.newsletter_error())
              return
            }
            setStatus('success')
          } catch {
            setStatus('error')
            setError(m.newsletter_error())
          }
        }}
      >
        <Input
          name="email"
          type="email"
          required
          placeholder={placeholder}
          className="sm:max-w-xs"
        />
        <Button type="submit" disabled={status === 'loading'}>
          {m.newsletter_subscribe()}
        </Button>
      </form>
      {status === 'success' && (
        <p className="mt-3 text-sm text-green-600">{successMessage ?? m.newsletter_success()}</p>
      )}
      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">
          {m.newsletter_error()}: {error}
        </p>
      )}
    </section>
  )
}
