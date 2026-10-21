import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { localeSchema } from '@/config/locale'
import { getMailFrom } from '@/config/service-status'
import { websiteConfig } from '@/config/website'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { getServerContext } from '@/lib/server-context'
import { sendMail } from '@/mail'

/**
 * Mail API 路由。
 *
 * 安全约束：必须有会话；`to` 必须在 ADMIN_EMAILS 内；发件人强制为 provider 默认值，
 * 忽略客户端传入的 fromAddress（防伪造）。
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
  locale: localeSchema,
  context: contactMessageContextSchema,
})

export const Route = createFileRoute('/api/email/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 门禁必须先于鉴权、body 解析与 provider 调用。
        const unavailable = getModuleUnavailableResponse('mail')
        if (unavailable) return unavailable

        const { env } = getServerContext()

        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        let body: z.infer<typeof bodySchema>
        try {
          body = bodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // 收件人与调用者都必须命中 ADMIN_EMAILS。
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

        // provider 与发件人取自站点配置，与 mail registry 同源。
        const provider = websiteConfig.mail.provider
        const defaultSender = getMailFrom(websiteConfig, env)

        const result = await sendMail(provider, {
          to: body.to,
          template: body.template,
          locale: body.locale,
          context: body.context,
          fromAddress: defaultSender,
        })

        if (!result.ok) {
          // 不把完整错误返回给客户端：可能含 SDK 内部信息。
          return Response.json({ error: 'send failed' }, { status: 502 })
        }

        return Response.json(result, { status: 200 })
      },
    },
  },
})
