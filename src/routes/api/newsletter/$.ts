import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { checkRateLimit, subscribe, unsubscribe } from '@/newsletter'

const subscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

const unsubscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  )
}

function jsonRateLimited() {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/newsletter/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request)
        if (!(await checkRateLimit(ip, 'subscribe'))) {
          return jsonRateLimited()
        }

        const body = await request.json().catch(() => null)
        const parsed = subscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonOk()

        try {
          await subscribe('resend', { email: parsed.data.email })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[newsletter] subscribe failed: ${msg.split('\n')[0]}`)
        }

        return jsonOk()
      },

      DELETE: async ({ request }) => {
        const ip = getClientIp(request)
        if (!(await checkRateLimit(ip, 'unsubscribe'))) {
          return jsonRateLimited()
        }

        const body = await request.json().catch(() => null)
        const parsed = unsubscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonOk()

        try {
          await unsubscribe('resend', { email: parsed.data.email })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[newsletter] unsubscribe failed: ${msg.split('\n')[0]}`)
        }

        return jsonOk()
      },
    },
  },
})
