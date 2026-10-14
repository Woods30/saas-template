import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { getMailFrom } from '@/config/service-status'
import { websiteConfig } from '@/config/website'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
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
// Shared contact-message context schema (exported for unit-test import)
export const contactMessageContextSchema = z.object({
  fromName: z.string().max(200),
  fromEmail: z.string().email().max(200),
  subject: z.string().max(500),
  message: z.string().max(10000),
})

const bodySchema = z.object({
  to: z.string().email(),
  template: z.literal('contactMessage'),
  locale: z.enum(['zh', 'en']),
  context: contactMessageContextSchema,
})

export const Route = createFileRoute('/api/email/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 门禁先于鉴权、body 解析与 provider 调用。
        const unavailable = getModuleUnavailableResponse('mail')
        if (unavailable) return unavailable

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

        // --- Caller must be in ADMIN_EMAILS allowlist (Finding 2) ---
        const rawAdminEmails = (env as { ADMIN_EMAILS?: string }).ADMIN_EMAILS ?? ''
        const adminEmails = rawAdminEmails
          ? rawAdminEmails.split(',').map((e: string) => e.trim().toLowerCase())
          : []
        if (!adminEmails.includes(body.to.toLowerCase())) {
          return new Response('Recipient not allowed', { status: 403 })
        }

        const callerEmail = session.user?.email
        if (!callerEmail || !adminEmails.includes(callerEmail.toLowerCase())) {
          return new Response('Forbidden', { status: 403 })
        }

        // --- Determine provider and sender from unified config ---
        // Provider 与发件人均取自站点配置 / 归一化 env，与 mail registry 保持同源；
        // 不再依据 `EMAIL` binding 存在与否临时切换 provider。
        const provider = websiteConfig.mail.provider
        const defaultSender = getMailFrom(websiteConfig, env)

        // --- Send; ignore client-supplied fromAddress (prevents sender spoofing) ---
        const result = await sendMail(provider, {
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
