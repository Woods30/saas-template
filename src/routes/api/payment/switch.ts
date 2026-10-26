import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getAuth } from '@/auth/auth'
import { productExclusivityMap, productTierMap, resolveLookupKey } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { createDb, schema } from '@/db'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerContext } from '@/lib/server-context'
import { getPaymentProvider, type ProviderSubscription } from '@/payment'
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  type OwnershipContext,
  purchaseBlockedBy,
  resolveSwitchDirection,
} from '@/payment/plan-state'
import type { PriceCatalog } from '@/payment/price-catalog'
import { getPriceCatalog } from '@/payment/price-catalog.server'

/**
 * 切换方案（换档位 / 换计费周期）。
 *
 * 一个账号最多一份**活跃订阅**——要换档位只能改**现有那份**订阅的价格
 * （Stripe 的 `subscriptions.update` 替换订阅项的 Price），不能新开一份：两份
 * 订阅就是两份扣款，账单页也只能标一份「当前生效」。
 *
 * 降级**期末生效**：用 `proration_behavior: 'none'`——本期已付金额不变，新价从
 * 下一张账单起算。代价是 Stripe 上的价格立刻变成新价，所以本地要另记一份
 * 「待生效」的方案（`subscriptions.pending_*`），账单页才不会显示一个用户其实
 * 没在付的低价。
 *
 * 客户端**不传** Price id，与结账同一原则：价格由服务端按 `lookup_key` 解析。
 */

/** 请求体：目标档位 + 目标周期。`one_time` 会被拒（买断不是订阅）。 */
const switchBodySchema = z.object({
  productId: z.string(),
  interval: z.enum(['month', 'year', 'one_time']),
})

/** 阻止切换的原因 → 错误码。错误码是稳定的对外契约。 */
const BLOCK_ERROR_CODES = {
  /** 已持有该产品的买断：不用再订。 */
  same_product: 'ALREADY_SUBSCRIBED',
  /** 已有持有物查不出属于哪个产品：判不出，保守挡住。 */
  unknown_product: 'ALREADY_OWNED_UNKNOWN_PRODUCT',
  /** 已持有更高等级的买断：买断是终态权益，不能被订阅顶掉。 */
  higher_tier: 'ALREADY_OWNED_HIGHER_TIER',
  /** 配置显式声明互斥。 */
  exclusive_product: 'ALREADY_OWNED_EXCLUSIVE_PRODUCT',
} as const

/** 时间 → ISO 字符串；缺失或非法时返回 `null`，绝不写 `Invalid Date`。 */
function toIso(value: Date | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return new Date(time).toISOString()
}

/** Stripe 的「资源不存在」：订阅已被取消/删除。 */
function isResourceMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  return (err as { code?: unknown }).code === 'resource_missing'
}

export const Route = createFileRoute('/api/payment/switch')({
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

        // 直接动钱的操作，限流比结账更紧。
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
        const allowed = await checkRateLimit({
          ip,
          action: 'payment:switch',
          limit: 5,
          windowSeconds: 60,
        })
        if (!allowed) {
          return new Response('Too Many Requests', { status: 429 })
        }

        let body: z.infer<typeof switchBodySchema>
        try {
          body = switchBodySchema.parse(await request.json())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }

        // 目标价由服务端按 lookup_key 解析：客户端无从指定 Price id。
        const lookupKey = resolveLookupKey(body.productId, body.interval)
        if (!lookupKey) {
          return Response.json({ error: 'PRICE_NOT_CONFIGURED' }, { status: 400 })
        }

        let catalog: PriceCatalog
        try {
          catalog = await getPriceCatalog()
        } catch (err) {
          console.error(
            '[payment-switch] 取价失败：',
            err instanceof Error ? err.message.split('\n')[0] : 'unknown',
          )
          return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
        }
        const target = catalog[lookupKey]
        if (!target) {
          return Response.json({ error: 'PRICE_NOT_CONFIGURED' }, { status: 400 })
        }
        // 买断是一次性购买，不走切换。
        if (!target.recurring) {
          return Response.json({ error: 'NOT_A_SUBSCRIPTION' }, { status: 400 })
        }

        const db = createDb(env.DB)
        const [subscriptions, purchases] = await Promise.all([
          db
            .select({
              id: schema.subscriptions.id,
              subscriptionId: schema.subscriptions.subscriptionId,
              status: schema.subscriptions.status,
              priceId: schema.subscriptions.priceId,
              productId: schema.subscriptions.productId,
              stripeProductId: schema.subscriptions.stripeProductId,
              amount: schema.subscriptions.amount,
              currency: schema.subscriptions.currency,
              interval: schema.subscriptions.interval,
              currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
              pendingPriceId: schema.subscriptions.pendingPriceId,
              pendingProductId: schema.subscriptions.pendingProductId,
              pendingStripeProductId: schema.subscriptions.pendingStripeProductId,
              pendingInterval: schema.subscriptions.pendingInterval,
              pendingAmount: schema.subscriptions.pendingAmount,
              pendingCurrency: schema.subscriptions.pendingCurrency,
              pendingEffectiveAt: schema.subscriptions.pendingEffectiveAt,
            })
            .from(schema.subscriptions)
            .where(
              and(
                eq(schema.subscriptions.userId, userId),
                inArray(schema.subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
              ),
            ),
          db
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
            ),
        ])

        if (subscriptions.length === 0) {
          return Response.json({ error: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 409 })
        }
        // 多份活跃订阅是脏数据：判不出「当前那份」就不要动订阅。
        if (subscriptions.length > 1) {
          return Response.json({ error: 'MULTIPLE_ACTIVE_SUBSCRIPTIONS' }, { status: 409 })
        }
        const current = subscriptions[0]
        if (!current?.productId) {
          return Response.json({ error: BLOCK_ERROR_CODES.unknown_product }, { status: 409 })
        }
        if (!current.subscriptionId) {
          return Response.json({ error: 'SUBSCRIPTION_NOT_FOUND' }, { status: 409 })
        }

        const context: OwnershipContext = {
          tiersByProductId: productTierMap(),
          exclusivityByProductId: productExclusivityMap(),
        }

        // 已持有买断（尤其是更高等级的买断）时不允许切订阅：切完 webhook 立刻会
        // 把这条订阅接管掉，用户会看到「刚切完就没了」。
        const targetOwnership = {
          productId: body.productId,
          stripeProductId: target.stripeProductId,
        }
        for (const purchase of purchases) {
          const reason = purchaseBlockedBy(purchase, targetOwnership, context)
          if (!reason) continue
          return Response.json({ error: BLOCK_ERROR_CODES[reason] }, { status: 409 })
        }

        const currentPriceId = current.priceId ?? null
        const pendingPriceId = current.pendingPriceId ?? null

        const direction = resolveSwitchDirection({
          current: {
            kind: 'subscription',
            id: current.id,
            subscriptionId: current.subscriptionId,
            status: current.status,
            productId: current.productId,
            stripeProductId: current.stripeProductId,
            amount: current.amount,
            currency: current.currency,
            interval: current.interval,
          },
          target: {
            productId: body.productId,
            stripeProductId: target.stripeProductId,
            amount: target.amount,
            currency: target.currency,
            interval: body.interval,
          },
          context,
        })

        const base = {
          direction,
          productId: body.productId,
          interval: body.interval,
          amount: target.amount,
          currency: target.currency,
          currentPeriodEnd: toIso(current.currentPeriodEnd),
        }

        // 幂等 ①：目标就是当前方案，且没有待生效的变更 —— 无事可做，不打 Stripe。
        if (!pendingPriceId && currentPriceId && target.priceId === currentPriceId) {
          return Response.json({ ...base, status: 'unchanged', effectiveAt: null }, { status: 200 })
        }

        // 幂等 ②：已经安排过同一个目标 —— 什么都不用做。
        if (pendingPriceId && target.priceId === pendingPriceId) {
          return Response.json(
            {
              ...base,
              status: 'scheduled',
              direction: 'downgrade',
              productId: current.pendingProductId ?? body.productId,
              interval: current.pendingInterval ?? body.interval,
              amount: current.pendingAmount ?? target.amount,
              currency: current.pendingCurrency ?? target.currency,
              effectiveAt: toIso(current.pendingEffectiveAt),
            },
            { status: 200 },
          )
        }

        const provider = getPaymentProvider(websiteConfig.payment.provider)

        // 订阅项 id 必须从 Stripe 读：本地没存，而漏传它会让 Stripe **新增**一个
        // 订阅项而不是替换，两个价格同时生效。
        let snapshot: ProviderSubscription
        try {
          snapshot = await provider.retrieveSubscription(current.subscriptionId)
        } catch (err) {
          if (isResourceMissing(err)) {
            return Response.json({ error: 'SUBSCRIPTION_NOT_FOUND' }, { status: 409 })
          }
          console.error(
            '[payment-switch] 读订阅失败：',
            err instanceof Error ? err.message.split('\n')[0] : 'unknown',
          )
          return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
        }
        if (!snapshot.itemId) {
          return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
        }

        const clearPending = async () => {
          await db
            .update(schema.subscriptions)
            .set({
              pendingPriceId: null,
              pendingProductId: null,
              pendingStripeProductId: null,
              pendingInterval: null,
              pendingAmount: null,
              pendingCurrency: null,
              pendingEffectiveAt: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, current.id))
        }

        // 幂等 ③：目标就是当前方案，但有已安排的降级 —— 取消它。
        // 恢复必须把 Stripe 的价格拉回用户实付的档位：否则周期末会按低价续费。
        if (pendingPriceId && currentPriceId && target.priceId === currentPriceId) {
          try {
            await provider.updateSubscriptionPrice({
              subscriptionId: current.subscriptionId,
              itemId: snapshot.itemId,
              priceId: currentPriceId,
              prorationBehavior: 'none',
              metadata: {
                productId: current.productId,
                ...(current.stripeProductId ? { stripeProductId: current.stripeProductId } : {}),
              },
            })
          } catch (err) {
            console.error(
              '[payment-switch] 取消降级失败：',
              err instanceof Error ? err.message.split('\n')[0] : 'unknown',
            )
            return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
          }
          await clearPending()
          return Response.json(
            { ...base, status: 'unchanged', effectiveAt: null, pendingCancelled: true },
            { status: 200 },
          )
        }

        const metadata = {
          productId: body.productId,
          ...(target.stripeProductId ? { stripeProductId: target.stripeProductId } : {}),
        }

        if (direction === 'downgrade') {
          // 降级：期末生效。先写 pending（写前意图），再调 Stripe。
          const effectiveAt = snapshot.currentPeriodEnd
            ? new Date(snapshot.currentPeriodEnd * 1000)
            : current.currentPeriodEnd
          await db
            .update(schema.subscriptions)
            .set({
              pendingPriceId: target.priceId,
              pendingProductId: body.productId,
              pendingStripeProductId: target.stripeProductId,
              pendingInterval: body.interval,
              pendingAmount: target.amount,
              pendingCurrency: target.currency,
              pendingEffectiveAt: effectiveAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, current.id))

          try {
            await provider.updateSubscriptionPrice({
              subscriptionId: current.subscriptionId,
              itemId: snapshot.itemId,
              priceId: target.priceId,
              // 'none' = 不产生折算：本期已付金额不变，新价从下一张账单起算。
              prorationBehavior: 'none',
              metadata,
            })
          } catch (err) {
            console.error(
              '[payment-switch] 安排降级失败：',
              err instanceof Error ? err.message.split('\n')[0] : 'unknown',
            )
            // 补偿：清掉 pending，回到「按当前价续费」的干净状态。
            await clearPending()
            return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
          }

          return Response.json(
            {
              ...base,
              status: 'scheduled',
              direction: 'downgrade',
              effectiveAt: toIso(effectiveAt),
            },
            { status: 200 },
          )
        }

        // 升级 / 同档换周期：立即生效并按比例结算。
        // 已安排的降级还在 → 先把 Stripe 价格恢复成用户实付的档位：否则折算基准
        // 是那个低价，升级会少收钱。
        if (pendingPriceId && currentPriceId) {
          try {
            await provider.updateSubscriptionPrice({
              subscriptionId: current.subscriptionId,
              itemId: snapshot.itemId,
              priceId: currentPriceId,
              prorationBehavior: 'none',
              metadata: {
                productId: current.productId,
                ...(current.stripeProductId ? { stripeProductId: current.stripeProductId } : {}),
              },
            })
          } catch (err) {
            console.error(
              '[payment-switch] 恢复当前价格失败：',
              err instanceof Error ? err.message.split('\n')[0] : 'unknown',
            )
            return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
          }
        }

        try {
          await provider.updateSubscriptionPrice({
            subscriptionId: current.subscriptionId,
            itemId: snapshot.itemId,
            priceId: target.priceId,
            // 'always_invoice' = 立刻按差额开票扣款。
            prorationBehavior: 'always_invoice',
            metadata,
          })
        } catch (err) {
          console.error(
            '[payment-switch] 切换失败：',
            err instanceof Error ? err.message.split('\n')[0] : 'unknown',
          )
          // 已经恢复过的话，把 pending 清掉：回到「按当前价续费」的干净状态。
          if (pendingPriceId) await clearPending()
          return Response.json({ error: 'STRIPE_ERROR' }, { status: 502 })
        }

        // 立即生效：本地行就地更新（不新建行、不取消旧行——一个账号只有一份订阅）。
        await db
          .update(schema.subscriptions)
          .set({
            priceId: target.priceId,
            productId: body.productId,
            stripeProductId: target.stripeProductId,
            interval: body.interval,
            amount: target.amount,
            currency: target.currency,
            pendingPriceId: null,
            pendingProductId: null,
            pendingStripeProductId: null,
            pendingInterval: null,
            pendingAmount: null,
            pendingCurrency: null,
            pendingEffectiveAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.id, current.id))

        return Response.json({ ...base, status: 'switched', effectiveAt: null }, { status: 200 })
      },
    },
  },
})
