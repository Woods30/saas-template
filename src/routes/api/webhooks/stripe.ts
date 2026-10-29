import { createFileRoute } from '@tanstack/react-router'
import { createDb } from '@/db'
import { getServerContext } from '@/lib/server-context'
import { getPaymentProvider } from '@/payment'
import { applyPaymentEvent } from '@/payment/events'

export const Route = createFileRoute('/api/webhooks/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = getServerContext()
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
          return new Response('not configured', { status: 503 })
        const raw = await request.text()
        const signature = request.headers.get('stripe-signature') ?? ''
        try {
          const provider = getPaymentProvider('stripe')
          const event = await provider.parseWebhookEvent(raw, signature)
          await applyPaymentEvent(
            createDb(env.DB),
            event,
            event.subscriptionId && event.type !== 'customer.subscription.deleted'
              ? () => provider.retrieveSubscription(event.subscriptionId as string)
              : undefined,
          )
          return new Response('ok')
        } catch (error) {
          const invalid =
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            error.type === 'StripeSignatureVerificationError'
          return new Response(invalid ? 'invalid signature' : 'processing failed', {
            status: invalid ? 400 : 500,
          })
        }
      },
    },
  },
})
