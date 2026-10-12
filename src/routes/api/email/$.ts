import { createFileRoute } from '@tanstack/react-router'
import { getServerContext } from '@/lib/server-context'
import { sendMail } from '@/mail'
import type { SendTemplateParams } from '@/mail/types'

/**
 * Mail API 路由。
 *
 * POST /api/email
 * Body: SendTemplateParams（to, template, locale, context, fromAddress?）
 *
 * env 从 ALS server context 获取（由 src/server.ts 注入）。
 */
export const Route = createFileRoute('/api/email/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as SendTemplateParams
        const { env } = getServerContext()

        // 运行时从 env 判断可用 provider（Cloudflare binding 优先）。
        const providerName = env.EMAIL ? 'cloudflare' : 'resend'
        const result = await sendMail(providerName, {
          ...body,
          fromAddress: body.fromAddress ?? env.CLOUDFLARE_EMAIL_SENDER,
        })

        return Response.json(result, { status: result.ok ? 200 : 500 })
      },
    },
  },
})
