import { and, eq, sql } from 'drizzle-orm'
import { resolveOfferCredits } from '@/config/products'
import { type DB, schema } from '@/core/db'
import { type ClawbackResult, clawbackCredits, grantCredits } from '@/modules/credits/service'

/**
 * 支付与积分账本之间的桥。
 *
 * 积分的数量与有效期写在 `src/config/products.ts` 的 offer 上；本文件只做两件事：
 * - 支付成功时按商品与付费方式发放；
 * - 退款时按退款比例反扣，扣到 0 为止。
 *
 * 幂等键由订单号派生：同一笔支付重复回调只发一次，续费是新订单号所以再发一次。
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface PaymentCreditGrantInput {
  /** `payments.id`，形如 `stripe:pi_1`。 */
  paymentId: string
  userId: string
  productId: string | null
  offerId: string | null
  /** 支付事件时间；积分有效期从这一刻起算。 */
  at: Date
}

/** 支付成功后按商品配置发放积分；没配置或配置非法时静默跳过。 */
export async function grantCreditsForPayment(
  db: DB,
  input: PaymentCreditGrantInput,
): Promise<void> {
  if (!input.productId || !input.offerId) return
  const grant = resolveOfferCredits(input.productId, input.offerId)
  if (!grant) return
  await grantCredits(db, {
    userId: input.userId,
    amount: grant.amount,
    source: 'purchase',
    reference: input.paymentId,
    expiresAt: grant.durationDays
      ? new Date(input.at.getTime() + grant.durationDays * DAY_MS)
      : undefined,
    idempotencyKey: `payment:${input.paymentId}`,
    now: input.at,
  })
}

export interface RefundClawbackInput {
  paymentId: string
  userId: string
  /** 订单金额（最小货币单位）。 */
  amount: number
  /** 本次事件新增的退款金额（不是累计值）。 */
  deltaRefunded: number
  /** 退款后的累计退款金额；用作幂等键的一部分。 */
  refundedTotal: number
  at: Date
}

/**
 * 按退款比例反扣该订单发放的积分。
 *
 * 只扣这一笔支付开出的批次；余额不足时扣到 0 为止，差额由账本写进流水。
 * 返回 `null` 表示该订单没有发放过积分（或本次没有新增退款）。
 */
export async function clawbackCreditsForRefund(
  db: DB,
  input: RefundClawbackInput,
): Promise<ClawbackResult | null> {
  const delta = Math.min(Math.max(input.deltaRefunded, 0), input.amount)
  if (delta <= 0) return null
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.creditGrants.amount}), 0)` })
    .from(schema.creditGrants)
    .where(
      and(
        eq(schema.creditGrants.userId, input.userId),
        eq(schema.creditGrants.reference, input.paymentId),
      ),
    )
  const granted = Number(row?.total ?? 0)
  if (granted <= 0) return null
  const target = Math.round((granted * delta) / input.amount)
  if (target <= 0) return null
  return clawbackCredits(db, {
    userId: input.userId,
    reference: input.paymentId,
    amount: target,
    reason: 'refund',
    idempotencyKey: `refund-clawback:${input.paymentId}:${input.refundedTotal}`,
    now: input.at,
  })
}
