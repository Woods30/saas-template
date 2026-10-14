import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { getPaymentProvider } from '@/payment'

const checkoutBodySchema = z.object({
  priceId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string(),
  mode: z.enum(['subscription', 'payment']),
  locale: z.enum(['zh', 'en']).optional(),
})

const portalBodySchema = z.object({
  returnUrl: z.string(),
})

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

export async function createCheckoutSession(params: {
  priceId: string
  successUrl: string
  cancelUrl: string
  mode: 'subscription' | 'payment'
  locale?: 'zh' | 'en'
  userId: string
  customerEmail: string
}): Promise<{ url: string; sessionId: string }> {
  const provider = getPaymentProvider(websiteConfig.payment.provider)
  return provider.createCheckoutSession(params)
}

export const Route = createFileRoute('/api/payment/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 门禁先于鉴权、限流、body 解析与 provider 调用。
        const unavailable = getModuleUnavailableResponse('payment')
        if (unavailable) return unavailable

        const { env } = getServerContext()

        // --- Auth gate ---
        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        const userId = session.user.id
        const customerEmail = session.user.email

        // --- Rate limit ---
        const ip = getClientIp(request)
        const allowed = await checkRateLimit({
          ip,
          action: 'payment:checkout',
          limit: 10,
          windowSeconds: 60,
        })
        if (!allowed) {
          return new Response('Too Many Requests', { status: 429 })
        }

        // --- Parse body ---
        let body: z.infer<typeof checkoutBodySchema>
        try {
          body = checkoutBodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // --- Validate priceId against allowlist ---
        const { allowedPriceIds } = websiteConfig.payment
        if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(body.priceId)) {
          return new Response('Disallowed priceId', { status: 400 })
        }

        try {
          const result = await createCheckoutSession({
            priceId: body.priceId,
            successUrl: body.successUrl,
            cancelUrl: body.cancelUrl,
            mode: body.mode,
            locale: body.locale,
            userId,
            customerEmail: customerEmail ?? '',
          })
          return Response.json(result, { status: 200 })
        } catch (err) {
          console.error('[payment-checkout]', err instanceof Error ? err.message : 'unknown')
          return new Response('Checkout failed', { status: 502 })
        }
      },

      DELETE: async ({ request }) => {
        // 门禁先于鉴权、限流、body 解析与 DB 查询。
        const unavailable = getModuleUnavailableResponse('payment')
        if (unavailable) return unavailable

        const { env } = getServerContext()

        // --- Auth gate ---
        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        const userId = session.user.id

        // --- Rate limit ---
        const ip = getClientIp(request)
        const allowed = await checkRateLimit({
          ip,
          action: 'payment:portal',
          limit: 10,
          windowSeconds: 60,
        })
        if (!allowed) {
          return new Response('Too Many Requests', { status: 429 })
        }

        // --- Parse body ---
        let body: z.infer<typeof portalBodySchema>
        try {
          body = portalBodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // --- Look up caller's customerId from DB (IDOR fix: never trust client-supplied customerId) ---
        const db = createDb(env.DB)
        const subRow = await db
          .select({ customerId: schema.subscriptions.customerId })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.userId, userId))
          .limit(1)
          .then((rows) => rows[0])

        if (!subRow?.customerId) {
          return new Response('No subscription found', { status: 404 })
        }

        try {
          const provider = getPaymentProvider(websiteConfig.payment.provider)
          const result = await provider.createCustomerPortalLink({
            customerId: subRow.customerId,
            returnUrl: body.returnUrl,
          })
          return Response.json(result, { status: 200 })
        } catch (err) {
          console.error('[payment-portal]', err instanceof Error ? err.message : 'unknown')
          return new Response('Portal failed', { status: 502 })
        }
      },
    },
  },
})
