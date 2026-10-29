import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { localeSchema } from '@/config/locale'
import { resolvePriceReference } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { createDb } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { safeSameOriginUrl } from '@/lib/urls'
import { getPaymentProvider } from '@/payment'
import { beginCheckout, findCustomerId } from '@/payment/checkout'
import { isTemplatePriceValid } from '@/payment/price-catalog'
import { getPriceCatalog } from '@/payment/price-catalog.server'

const checkoutBody = z.object({
  productId: z.string(),
  offerId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string(),
  locale: localeSchema.optional(),
})
const portalBody = z.object({ returnUrl: z.string() })

async function authorize(request: Request, action: string) {
  const unavailable = getModuleUnavailableResponse('payment')
  if (unavailable) return unavailable
  const { env } = getServerContext()
  const session = await getAuth(env).api.getSession({ headers: request.headers })
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (
    !(await checkRateLimit({
      ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
      action,
      limit: 10,
      windowSeconds: 60,
    }))
  )
    return new Response('Too Many Requests', { status: 429 })
  return { session, db: createDb(env.DB) }
}

export const Route = createFileRoute('/api/payment/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authorize(request, 'payment:checkout')
        if (auth instanceof Response) return auth
        const body = checkoutBody.safeParse(await request.json().catch(() => null))
        if (!body.success) return new Response('Bad Request', { status: 400 })
        const { productId, offerId, locale } = body.data
        const reference = resolvePriceReference(productId, offerId)
        const successUrl = safeSameOriginUrl(body.data.successUrl)
        const cancelUrl = safeSameOriginUrl(body.data.cancelUrl)
        if (!reference || !successUrl || !cancelUrl)
          return new Response('Invalid checkout', { status: 400 })
        try {
          const price = (await getPriceCatalog())[reference]
          if (
            !price ||
            (productId === websiteConfig.template.productId && !isTemplatePriceValid(price))
          )
            return Response.json({ error: 'PRICE_UNAVAILABLE' }, { status: 400 })
          const provider = getPaymentProvider(websiteConfig.payment.provider)
          const customerId = await findCustomerId(
            auth.db,
            auth.session.user.id,
            provider.getProviderName(),
          )
          const result = await beginCheckout(auth.db, provider, {
            productId,
            offerId,
            locale,
            successUrl,
            cancelUrl,
            priceId: price.priceId,
            mode: price.mode,
            userId: auth.session.user.id,
            customerEmail: auth.session.user.email,
            customerId,
          })
          return result
            ? Response.json(result)
            : Response.json({ error: 'ALREADY_SUBSCRIBED' }, { status: 409 })
        } catch (error) {
          if (error instanceof Error && error.message === 'CHECKOUT_PENDING')
            return Response.json({ error: 'CHECKOUT_PENDING' }, { status: 409 })
          return new Response('Checkout unavailable', { status: 502 })
        }
      },
      DELETE: async ({ request }) => {
        const auth = await authorize(request, 'payment:portal')
        if (auth instanceof Response) return auth
        const body = portalBody.safeParse(await request.json().catch(() => null))
        const returnUrl = body.success ? safeSameOriginUrl(body.data.returnUrl) : null
        if (!returnUrl) return new Response('Invalid return URL', { status: 400 })
        try {
          const provider = getPaymentProvider(websiteConfig.payment.provider)
          const customerId = await findCustomerId(
            auth.db,
            auth.session.user.id,
            provider.getProviderName(),
          )
          if (!customerId) return new Response('No billing account', { status: 404 })
          return Response.json(await provider.createCustomerPortalLink({ customerId, returnUrl }))
        } catch {
          return new Response('Portal unavailable', { status: 502 })
        }
      },
    },
  },
})
