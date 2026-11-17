import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { createDbFromEnv } from '@/core/db'
import { getPaymentProvider } from '@/core/payment'
import { applyPaymentEvent } from '@/core/payment/events'
import { CreemSignatureError } from '@/core/payment/provider/creem'
import { getServerContext } from '@/lib/server-context'

/**
 * Creem Webhook。
 *
 * 与 Stripe 端点一致，**不受** `payment.enabled` 门禁：模块关掉后存量订阅仍要能
 * 收到取消、续费失败等事件，否则本地状态永远停在关闭那一刻。
 *
 * 响应码约定（与 Creem 文档一致）：
 * - 不是当前渠道：404，让 Creem 停止重试；
 * - 缺负载或签名、签名不合法：400，重试也不会成功；
 * - 处理失败：500，让 Creem 按退避策略重试（处理逻辑幂等）。
 */
export const Route = createFileRoute('/api/webhooks/creem')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (websiteConfig.payment.provider !== 'creem')
          return new Response('not configured', { status: 404 })

        const { env } = getServerContext()
        if (!env.CREEM_API_KEY || !env.CREEM_WEBHOOK_SECRET)
          return new Response('not configured', { status: 503 })

        const raw = await request.text()
        const signature = request.headers.get('creem-signature') ?? ''
        if (!raw || !signature) return new Response('missing payload or signature', { status: 400 })

        try {
          const provider = getPaymentProvider('creem')
          const event = await provider.parseWebhookEvent(raw, signature)
          await applyPaymentEvent(createDbFromEnv(env), event)
          return new Response('ok')
        } catch (error) {
          if (error instanceof CreemSignatureError)
            return new Response('invalid signature', { status: 400 })
          return new Response('processing failed', { status: 500 })
        }
      },
    },
  },
})
