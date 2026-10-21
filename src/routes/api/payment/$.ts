import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { type Locale, localeSchema } from '@/config/locale'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { safeSameOriginUrl } from '@/lib/urls'
import { getPaymentProvider } from '@/payment'

const checkoutBodySchema = z.object({
  priceId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string(),
  mode: z.enum(['subscription', 'payment']),
  locale: localeSchema.optional(),
})

const portalBodySchema = z.object({
  returnUrl: z.string(),
})

/**
 * 视为「已占用订阅名额」的 Stripe 订阅状态，对齐 Stripe 的「已有活跃订阅」判定。
 *
 * 不止 `active`：`past_due` / `unpaid` 是扣款失败但订阅仍在，此时再买一份会叠加账单。
 */
const BLOCKING_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused']

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

export async function createCheckoutSession(params: {
  priceId: string
  successUrl: string
  cancelUrl: string
  mode: 'subscription' | 'payment'
  locale?: Locale
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
        // 门禁必须先于鉴权、限流、body 解析与 provider 调用。
        const unavailable = getModuleUnavailableResponse('payment')
        if (unavailable) return unavailable

        const { env } = getServerContext()

        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        const userId = session.user.id
        const customerEmail = session.user.email

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

        let body: z.infer<typeof checkoutBodySchema>
        try {
          body = checkoutBodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // priceId 必须过白名单，不能直接信任客户端传入的值。
        const { allowedPriceIds } = websiteConfig.payment
        if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(body.priceId)) {
          return new Response('Disallowed priceId', { status: 400 })
        }

        // 回跳地址必须同源：这两个 URL 会被原样交给 Stripe，客户端传什么就跳什么，
        // 等于把「付款后落点」的决定权交出去——开放重定向可用来钓鱼。
        // 只认配置里的站点 origin，不认请求自身的 origin（Host 头由客户端控制）。
        const successUrl = safeSameOriginUrl(body.successUrl)
        const cancelUrl = safeSameOriginUrl(body.cancelUrl)
        if (!successUrl || !cancelUrl) {
          return new Response('Invalid return URL', { status: 400 })
        }

        // 拒绝重复订阅：一个用户只能有一份订阅，换方案走 Billing Portal 折算迁移。
        // 一次性支付不在此列。这是应用侧守卫，与 Stripe 后台的「限一个客户一个订阅」
        // 互为两层——后者挡得住绕过本站的 Checkout 链接。
        if (body.mode === 'subscription') {
          const db = createDb(env.DB)
          const existing = await db
            .select({ id: schema.subscriptions.id })
            .from(schema.subscriptions)
            .where(
              and(
                eq(schema.subscriptions.userId, userId),
                inArray(schema.subscriptions.status, BLOCKING_SUBSCRIPTION_STATUSES),
              ),
            )
            .limit(1)
          if (existing.length > 0) {
            return Response.json({ error: 'ALREADY_SUBSCRIBED' }, { status: 409 })
          }
        }

        try {
          const result = await createCheckoutSession({
            priceId: body.priceId,
            successUrl,
            cancelUrl,
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
        // 门禁必须先于鉴权、限流、body 解析与 DB 查询。
        const unavailable = getModuleUnavailableResponse('payment')
        if (unavailable) return unavailable

        const { env } = getServerContext()

        const session = await getAuth(env).api.getSession({ headers: request.headers })
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        const userId = session.user.id

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

        let body: z.infer<typeof portalBodySchema>
        try {
          body = portalBodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // 回跳地址必须同源：门户链接打开后 Stripe 会把用户送回这个地址。
        const returnUrl = safeSameOriginUrl(body.returnUrl)
        if (!returnUrl) {
          return new Response('Invalid return URL', { status: 400 })
        }

        // customerId 只能从 DB 反查，绝不接受客户端传入（否则可越权访问他人门户）。
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
            returnUrl,
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
