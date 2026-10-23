import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { type Locale, localeSchema } from '@/config/locale'
import { productExclusivityMap, productIntervals, resolveLookupKey } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { safeSameOriginUrl } from '@/lib/urls'
import { getPaymentProvider } from '@/payment'
import { ACTIVE_SUBSCRIPTION_STATUSES, isSupersededByPurchase } from '@/payment/plan-state'
import { getPriceCatalog } from '@/payment/price-catalog.server'

const checkoutBodySchema = z.object({
  /**
   * 本站产品 id（如 `pro`），不是 Price id。
   *
   * 客户端**不传** Price id：价格由服务端按 `lookup_key` 解析，改价不必改前端，
   * 客户端也无法指定任意价格。
   */
  productId: z.string(),
  /** 计费周期；不传时取该产品第一个已配置的周期。 */
  interval: z.enum(['month', 'year', 'one_time']).optional(),
  successUrl: z.string(),
  cancelUrl: z.string(),
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
const BLOCKING_SUBSCRIPTION_STATUSES = [...ACTIVE_SUBSCRIPTION_STATUSES]

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
  productId?: string
  stripeProductId?: string
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

        // 价格由服务端解析：产品 + 周期 → lookup_key → Stripe Price。
        // 客户端无从指定 Price id，既堵住了「换个价格下单」，也让改价不必改前端。
        const interval = body.interval ?? productIntervals(body.productId)[0]
        const lookupKey = interval ? resolveLookupKey(body.productId, interval) : undefined
        if (!lookupKey) {
          return new Response('Unknown product', { status: 400 })
        }

        // 回跳地址必须同源：这两个 URL 会被原样交给 Stripe，客户端传什么就跳什么，
        // 等于把「付款后落点」的决定权交出去——开放重定向可用来钓鱼。
        // 只认配置里的站点 origin，不认请求自身的 origin（Host 头由客户端控制）。
        const successUrl = safeSameOriginUrl(body.successUrl)
        const cancelUrl = safeSameOriginUrl(body.cancelUrl)
        if (!successUrl || !cancelUrl) {
          return new Response('Invalid return URL', { status: 400 })
        }

        // 计费模式以 **Stripe 上的 Price** 为准，而不是配置里的猜测：
        // 一次性 Price 没有 `recurring`，订阅 Price 有。
        let price: { priceId: string; recurring: boolean; stripeProductId: string | null }
        try {
          const catalog = await getPriceCatalog()
          const found = catalog[lookupKey]
          if (!found) {
            return new Response('Price not configured', { status: 400 })
          }
          price = {
            priceId: found.priceId,
            recurring: found.recurring,
            stripeProductId: found.stripeProductId,
          }
        } catch (err) {
          console.error(
            '[payment-checkout] 取价失败：',
            err instanceof Error ? err.message.split('\n')[0] : 'unknown',
          )
          return new Response('Price lookup failed', { status: 502 })
        }
        const mode = price.recurring ? 'subscription' : 'payment'

        // 拒绝重复订阅：一个用户只能有一份订阅，换方案走 Billing Portal 折算迁移。
        // 一次性支付不在此列。这是应用侧守卫，与 Stripe 后台的「限一个客户一个订阅」
        // 互为两层——后者挡得住绕过本站的 Checkout 链接。
        if (mode === 'subscription') {
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

          // 已经买断**与它互斥**的产品就不能再订它：买断是那个东西的更高档位，
          // 再订一份等于让用户为同一份权益付两次钱。
          //
          // 互斥关系按产品配置声明（`exclusiveWith`，同一产品内天然互斥），没声明时
          // 按 Stripe Product 兜底。这条守卫只管订阅——一次性购买不受唯一性限制：
          // 实物商品可以买多件，多笔订单各自独立。
          const purchases = await db
            .select({
              productId: schema.payments.productId,
              stripeProductId: schema.payments.stripeProductId,
            })
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.userId, userId),
                eq(schema.payments.type, 'one_time'),
                eq(schema.payments.status, 'paid'),
              ),
            )
          if (purchases.length > 0) {
            const exclusivityByProductId = productExclusivityMap()
            const exclusive = purchases.some((purchase) =>
              isSupersededByPurchase({
                purchase: {
                  productId: purchase.productId,
                  stripeProductId: purchase.stripeProductId,
                },
                subscription: {
                  productId: body.productId,
                  stripeProductId: price.stripeProductId,
                },
                exclusivityByProductId,
              }),
            )
            if (exclusive) {
              return Response.json({ error: 'ALREADY_OWNED_EXCLUSIVE_PRODUCT' }, { status: 409 })
            }
          }
        }

        try {
          const result = await createCheckoutSession({
            priceId: price.priceId,
            successUrl,
            cancelUrl,
            mode,
            locale: body.locale,
            userId,
            customerEmail: customerEmail ?? '',
            productId: body.productId,
            stripeProductId: price.stripeProductId ?? undefined,
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
