import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/db/paging'
import { clawbackCreditsForRefund } from './credits'

/**
 * 管理台付款列表。
 *
 * 「付款」指已确认的资金事实（`payments` 表）：一笔支付就是一条记录，退款也记在
 * 同一行上。与订阅列表分开，因为两者的状态集合不同——支付有
 * `partially_refunded`，订阅没有。
 */

/** 付款状态筛选。`all` 表示不过滤。 */
export type AdminOrderStatusFilter = 'all' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'

/** 付款类型 tab：资金事实按「订阅 / 一次性 / 人工核销」分档。 */
export type AdminPaymentTab = 'all' | 'subscription' | 'one_time' | 'manual_payments'

export interface AdminOrder {
  id: string
  /** 这笔付款对应的结账订单；历史数据或无法归属时为空。 */
  orderId: string | null
  /** 买家 id；支付行可能没有用户（外键可空，历史数据也可能有孤儿行）。 */
  userId: string | null
  /** 买家邮箱；用户行缺失时为空字符串——行本身仍然展示，不静默丢弃。 */
  email: string
  provider: string
  type: string
  status: string
  /** 金额，最小货币单位（分）。 */
  amount: number
  refundedAmount: number
  currency: string
  productId: string | null
  description: string | null
  paidAt: Date | string | null
  createdAt: Date | string
}

export interface AdminPaymentsQuery {
  status?: AdminOrderStatusFilter
  limit?: number
  offset?: number
}

export interface AdminOrdersResult {
  orders: AdminOrder[]
  /** 符合筛选条件的总条数，与当页条数无关。 */
  total: number
}

/**
 * 查付款列表。
 *
 * 左连接用户表而非内连接：外键未强制时（历史数据、直接写库）支付行可能指向
 * 不存在的用户，内连接会静默丢行，让支付数与营收对不上。
 */
export async function queryAdminPayments(
  db: DB,
  query: AdminPaymentsQuery = {},
): Promise<AdminOrdersResult> {
  const status = query.status ?? 'all'
  const where = status === 'all' ? undefined : eq(schema.payments.status, status)
  const limit = query.limit ?? DEFAULT_PAGE_SIZE
  const offset = query.offset ?? 0

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: schema.payments.id,
        orderId: schema.payments.orderId,
        userId: schema.payments.userId,
        email: schema.users.email,
        provider: schema.payments.provider,
        type: schema.payments.type,
        status: schema.payments.status,
        amount: schema.payments.amount,
        refundedAmount: schema.payments.refundedAmount,
        currency: schema.payments.currency,
        productId: schema.payments.productId,
        description: schema.payments.description,
        paidAt: schema.payments.paidAt,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.userId))
      .where(where)
      // `id` 作 tiebreaker：同一秒的多笔支付不少，只按时间排序时翻页会重复或漏项。
      .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.payments).where(where),
  ])

  return {
    orders: rows.map((row) => ({ ...row, email: row.email ?? '' })),
    total: counted[0]?.value ?? 0,
  }
}

const paymentsQuerySchema = z.object({
  status: z.enum(['all', 'paid', 'failed', 'refunded', 'partially_refunded']).default('all'),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

/**
 * 付款列表的 server function。
 *
 * 权限在服务端再校验：server function 是可被直接调用的 HTTP 端点，
 * 只靠菜单隐藏拦不住。
 */
export const fetchAdminPayments = createServerFn({ method: 'GET' })
  .validator((input: unknown) => paymentsQuerySchema.parse(input))
  .handler(async ({ data }): Promise<AdminOrdersResult> => {
    const { requireAdminDb } = await import('@/core/auth/session')
    const { db } = await requireAdminDb()
    return queryAdminPayments(db, data)
  })

export interface AdminRefundResult {
  status: 'refunded' | 'partially_refunded'
  refundedAmount: number
  /** 该订单应反扣的积分。 */
  creditsExpected: number
  /** 实际扣回的积分；积分已被消费时可能更少。 */
  creditsDeducted: number
}

const refundSchema = z.object({ orderId: z.string().min(1) })

/**
 * 后台全额退款。
 *
 * 并发保护靠一次**条件状态转移**：把 `paid` / `partially_refunded` 抢成
 * `refunding`，抢不到就说明另一次退款正在处理。渠道调用失败时把状态改回去，
 * 用户可以重试；成功后写 `refunded` 并反扣该订单发放的积分。
 *
 * 渠道侧的最终到账以 webhook 为准（Stripe `charge.refunded` 会再对一次账），
 * 这里先按「已受理」落库，避免后台显示长时间停在处理中。
 */
export const refundAdminOrder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => refundSchema.parse(input))
  .handler(async ({ data }): Promise<AdminRefundResult> => {
    const [{ requirePermissionDb }, { safeRecordAuditLog }, { getPaymentProvider }] =
      await Promise.all([
        import('@/modules/rbac/service'),
        import('@/modules/audit/service'),
        import('@/core/payment'),
      ])
    const { db, adminId } = await requirePermissionDb('payments.refund')

    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, data.orderId))
      .limit(1)
    if (!payment) throw new Response('ORDER_NOT_FOUND', { status: 404 })
    if (
      payment.status !== 'paid' &&
      payment.status !== 'partially_refunded' &&
      payment.status !== 'refunding'
    ) {
      throw new Response('ORDER_NOT_REFUNDABLE', { status: 409 })
    }
    if (payment.refundedAmount >= payment.amount) {
      throw new Response('ALREADY_REFUNDED', { status: 409 })
    }
    const providerName = payment.provider
    if (providerName !== 'stripe' && providerName !== 'creem') {
      throw new Response('REFUND_UNSUPPORTED', { status: 400 })
    }
    // Creem 只支持全额退款；已经部分退过的订单不能走 Creem 再退一次。
    if (providerName === 'creem' && payment.refundedAmount > 0) {
      throw new Response('REFUND_UNSUPPORTED', { status: 400 })
    }
    // Stripe 退款按 PaymentIntent 发起；早期只记录发票号的订单没有可退的标识。
    if (providerName === 'stripe' && !payment.chargeId) {
      throw new Response('REFUND_UNSUPPORTED', { status: 400 })
    }

    const remaining = payment.amount - payment.refundedAmount
    const claimed = await db
      .update(schema.payments)
      .set({ status: 'refunding' })
      .where(
        and(
          eq(schema.payments.id, payment.id),
          inArray(schema.payments.status, ['paid', 'partially_refunded']),
          eq(schema.payments.refundedAmount, payment.refundedAmount),
        ),
      )
      .returning({ id: schema.payments.id })
    if (claimed.length === 0) throw new Response('REFUND_CONFLICT', { status: 409 })

    try {
      const provider = getPaymentProvider(providerName)
      const result = await provider.refundPayment({
        paymentIntentId: payment.chargeId,
        transactionId: payment.externalId,
        amount: providerName === 'stripe' ? remaining : undefined,
      })
      if (result.status === 'failed' || result.status === 'canceled') {
        throw new Error('REFUND_REJECTED')
      }

      const refundedAmount = payment.refundedAmount + remaining
      const status = refundedAmount >= payment.amount ? 'refunded' : 'partially_refunded'
      await db
        .update(schema.payments)
        .set({ refundedAmount, refundedAt: new Date(), status })
        .where(eq(schema.payments.id, payment.id))

      const clawback = payment.userId
        ? await clawbackCreditsForRefund(db, {
            paymentId: payment.id,
            userId: payment.userId,
            amount: payment.amount,
            deltaRefunded: remaining,
            refundedTotal: refundedAmount,
            at: new Date(),
          })
        : null

      await safeRecordAuditLog(db, {
        actorId: adminId,
        actorType: 'admin',
        operation: 'payments.refund',
        targetType: 'payment',
        targetId: payment.id,
        summary: `退款 ${remaining} ${payment.currency.toUpperCase()}（${providerName}）${
          clawback
            ? `，积分应扣 ${clawback.expected}、实际扣减 ${clawback.deducted}、差额 ${clawback.shortfall}`
            : '，该订单未发放积分'
        }`,
      })

      return {
        status,
        refundedAmount,
        creditsExpected: clawback?.expected ?? 0,
        creditsDeducted: clawback?.deducted ?? 0,
      }
    } catch (error) {
      // 渠道没受理：把 claim 撤回，订单恢复成可重试的状态。
      await db
        .update(schema.payments)
        .set({ status: payment.status })
        .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.status, 'refunding')))
      throw error instanceof Response ? error : new Response('REFUND_FAILED', { status: 502 })
    }
  })
