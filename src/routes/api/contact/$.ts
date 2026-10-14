import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { deliverContactNotification } from '@/contact/notifications'
import type { ContactInput } from '@/contact/schema'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'

const contactBodySchema = z.object({
  name: z.string().min(1).max(100),
  fromEmail: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
})

export async function submitContact(
  ip: string,
  data: ContactInput,
): Promise<{ ok: true } | { error: string; status: number }> {
  const allowed = await checkRateLimit({
    ip,
    action: 'contact:submit',
    limit: 3,
    windowSeconds: 60,
  })
  if (!allowed) {
    return { error: 'Too Many Requests', status: 429 }
  }
  await deliverContactNotification(data)
  return { ok: true }
}

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

export const Route = createFileRoute('/api/contact/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 门禁先于 body 解析、限流与通知投递。
        const unavailable = getModuleUnavailableResponse('contact')
        if (unavailable) return unavailable

        const ip = getClientIp(request)

        const body = await request.json().catch(() => null)
        const parsed = contactBodySchema.safeParse(body)
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: 'Invalid input' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const result = await submitContact(ip, parsed.data)
        if ('error' in result) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: result.status,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})
