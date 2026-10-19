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
 * 视为「已占用订阅名额」的 Stripe 订阅状态。
 *
 * 取值对齐 Stripe 自己对「已有活跃订阅」的判定（Checkout 的「限制一个客户一个订阅」
 * 文档）：`active` / `trialing` / `past_due` / `unpaid` / `paused`。
 *
 * 为什么不止 `active`：`past_due` / `unpaid` 是**扣款失败但订阅仍在**——此时放用户再
 * 买一份，等于在同一份权益上叠加第二笔账单，也正是用户最困惑的时刻。`canceled` 与
 * `incomplete_expired` 不在此列：它们已经结束，用户可以正常重新订阅。
 *
 * 字符串字面量而非 `SubscriptionStatus` 枚举：这里是 SQL 的 `IN` 参数，Zod / TS 的
 * 联合类型在这里只会增加一层无收益的转换。
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

        // --- 拒绝重复订阅 ---
        //
        // 已有生效中的订阅时不再创建第二个：本模板的定价模型是「一个用户一份订阅」，
        // 用户重复购买只会得到两条并存的订阅，两边同时扣款，而账单页只能显示一份。
        // 换方案走 Stripe Billing Portal（账户页的「管理订阅」），那会把旧订阅折算
        // 迁移，不会多出一份。
        //
        // 一次性支付（`mode: 'payment'`，终身版）不在此列：买断没有「已有即重复」
        // 的概念，重复购买对用户是明确的自主行为。
        //
        // 状态集合对齐 Stripe 自己的「已有订阅」判定（`active` / `trialing` /
        // `past_due` / `unpaid` / `paused`，见 Stripe 的 Checkout「限制一个客户一个
        // 订阅」文档）：只挡 `active` 会漏掉扣款失败仍占着名额的订阅——那正是用户最
        // 不该再买一份的时候。`canceled` / `incomplete_expired` 不挡，它们已经结束。
        //
        // 这是**应用侧**的守卫，与 Stripe 后台的「Limit customers to 1 subscription」
        // 是两层：后台设置按邮箱 / Customer 对象匹配，挡得住绕过本站的 Checkout 链接；
        // 这里按本站 userId 判定，不受邮箱改动影响，也能给出明确的 409 文案。
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
