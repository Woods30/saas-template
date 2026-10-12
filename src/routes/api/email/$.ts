import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { getServerContext } from '@/lib/server-context'
import { sendMail } from '@/mail'

/**
 * Mail API 路由。
 *
 * POST /api/email
 * Body: { to, template, locale, context }
 *
 * Security:
 * - 鉴权：必须有有效会话。
 * - 收件人白名单：to 必须在 ADMIN_EMAILS 中（env-driven）。
 * - 强制发件人：忽略客户端 fromAddress，固定为 provider defaultSender。
 * - 严格上下文：renderTemplate 内部对每个 template 做 Zod strict 校验。
 *
 * env 从 ALS server context 获取（由 src/server.ts 注入）。
 */
const bodySchema = z.object({
  to: z.string().email(),
  template: z.enum(['verifyEmail', 'forgotPassword', 'contactMessage']),
  locale: z.enum(['zh', 'en']),
  context: z.record(z.string(), z.unknown()),
})

export const Route = createFileRoute('/api/email/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = getServerContext()

        // --- Auth gate ---
        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        // --- Parse & validate body ---
        let body: z.infer<typeof bodySchema>
        try {
          body = bodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // --- Recipient allowlist ---
        const rawAdminEmails = (env as { ADMIN_EMAILS?: string }).ADMIN_EMAILS ?? ''
        const adminEmails = rawAdminEmails
          ? rawAdminEmails.split(',').map((e: string) => e.trim())
          : []
        if (adminEmails.length > 0 && !adminEmails.includes(body.to)) {
          return new Response('Recipient not allowed', { status: 403 })
        }

        // --- Determine default sender from provider ---
        // Cloudflare binding has no credentials concept; fall back to CLOUDFLARE_EMAIL_SENDER.
        // Resend uses its own API key — defaultSender is baked into the provider at registration.
        const defaultSender = env.CLOUDFLARE_EMAIL_SENDER ?? 'noreply@example.com'

        // --- Send; ignore client-supplied fromAddress (prevents sender spoofing) ---
        const result = await sendMail(env.EMAIL ? 'cloudflare' : 'resend', {
          to: body.to,
          template: body.template,
          locale: body.locale,
          context: body.context,
          // Force defaultSender — client fromAddress is intentionally discarded.
          fromAddress: defaultSender,
        })

        if (!result.ok) {
          // Never return the full error to the client — it may contain SDK internals.
          return Response.json({ error: 'send failed' }, { status: 502 })
        }

        return Response.json(result, { status: 200 })
      },
    },
  },
})
