import { and, eq, notInArray } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'

/**
 * 在线结账的订单记录。
 *
 * 订单是「购买意图」：用户点结账时落一条，金额与币种留空，等渠道回调
 * （`payments`）才成为金额事实。订阅重试复用同一订单，一次性购买每次一单。
 */

export type OrderStatus = 'created' | 'open' | 'completed' | 'expired' | 'canceled' | 'failed'

type Db = DB
const ORDER_NO_ATTEMPTS = 2

/** `ord_<UTC yyyyMMddHHmmss>_<8 位随机>`。 */
export function newOrderNo(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `ord_${stamp}_${random}`
}

export interface CreateCheckoutOrderInput {
  userId: string
  provider: string
  productId: string
  offerId: string
  mode: 'subscription' | 'payment'
}

/**
 * 插入一条 `created` 状态的订单。
 *
 * 订单号按秒 + 随机段生成；同秒同随机段撞上唯一约束时换一个号重试一次，
 * 仍冲突则直接报错——重试无限次只会把真实故障拖成超时。
 */
export async function createCheckoutOrder(
  db: Db,
  input: CreateCheckoutOrderInput,
  now: Date = new Date(),
): Promise<{ id: string; orderNo: string }> {
  for (let attempt = 0; attempt < ORDER_NO_ATTEMPTS; attempt++) {
    const orderNo = newOrderNo(now)
    const [row] = await db
      .insert(schema.orders)
      .values({
        id: crypto.randomUUID(),
        orderNo,
        userId: input.userId,
        provider: input.provider,
        mode: input.mode,
        productId: input.productId,
        offerId: input.offerId,
        status: 'created',
      })
      .onConflictDoNothing({ target: schema.orders.orderNo })
      .returning({ id: schema.orders.id, orderNo: schema.orders.orderNo })
    if (row) return row
  }
  throw new Error('Order number collision')
}

/** 渠道会话创建成功后，把订单号与会话标识写回订单。 */
export async function markOrderOpen(
  db: Db,
  orderId: string,
  session: { sessionId: string; url: string; expiresAt: number },
): Promise<void> {
  await db
    .update(schema.orders)
    .set({
      status: 'open',
      providerSessionId: session.sessionId,
      providerUrl: session.url,
      expiresAt: new Date(session.expiresAt * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId))
}

/** 终态：结账尝试已经结束，后续事件不能把它改回 `completed`。 */
const TERMINAL_ORDER_STATUSES = ['failed', 'expired', 'canceled'] as const

export async function markOrderStatus(db: Db, orderId: string, status: OrderStatus): Promise<void> {
  // 完成事件可能晚于终态写入（例如 webhook 乱序）；`completed` 只允许从
  // 非终态推进，避免把失败 / 过期 / 取消的结账尝试"复活"。
  const where =
    status === 'completed'
      ? and(
          eq(schema.orders.id, orderId),
          notInArray(schema.orders.status, [...TERMINAL_ORDER_STATUSES]),
        )
      : eq(schema.orders.id, orderId)
  await db.update(schema.orders).set({ status, updatedAt: new Date() }).where(where)
}

export async function findOrderBySessionId(
  db: Db,
  provider: string,
  sessionId: string,
): Promise<{ id: string } | undefined> {
  const [row] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(
      and(eq(schema.orders.provider, provider), eq(schema.orders.providerSessionId, sessionId)),
    )
    .limit(1)
  return row
}
