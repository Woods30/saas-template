import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getServerContext } from '@/lib/server-context'
import { checkStatus, subscribe, unsubscribe } from '@/newsletter'

const subscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

const unsubscribeBodySchema = z.object({
  email: z.string().min(3).max(320),
})

const statusQuerySchema = z.object({
  email: z.string().min(3).max(320),
})

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/newsletter/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getServerContext().env
        if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
          return jsonError(503, 'Newsletter not configured')
        }
        const body = await request.json().catch(() => null)
        const parsed = subscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonError(400, 'Invalid body')
        const ok = await subscribe('resend', { email: parsed.data.email })
        return ok
          ? new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : jsonError(502, 'Subscribe failed')
      },

      DELETE: async ({ request }) => {
        const env = getServerContext().env
        if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
          return jsonError(503, 'Newsletter not configured')
        }
        const body = await request.json().catch(() => null)
        const parsed = unsubscribeBodySchema.safeParse(body)
        if (!parsed.success) return jsonError(400, 'Invalid body')
        const ok = await unsubscribe('resend', { email: parsed.data.email })
        return ok
          ? new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : jsonError(502, 'Unsubscribe failed')
      },

      GET: async ({ request }) => {
        const env = getServerContext().env
        if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
          return jsonError(503, 'Newsletter not configured')
        }
        const url = new URL(request.url)
        const parsed = statusQuerySchema.safeParse({ email: url.searchParams.get('email') })
        if (!parsed.success) return jsonError(400, 'Invalid email')
        const subscribed = await checkStatus('resend', { email: parsed.data.email })
        return new Response(JSON.stringify({ subscribed }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})
