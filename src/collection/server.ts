import { createServerFn } from '@tanstack/react-start'
import type { AdminOrderPage } from '@/collection/orders'
import {
  adminOrderListSchema,
  type CollectionGuardDeps,
  cancelOrderSchema,
  collectionAccountSchema,
  createOrderSchema,
  errorResponse,
  failureResponse,
  guardCollectionRequest,
  orderIdSchema,
  resolveAdminOrderQuery,
  reviewOrderSchema,
  submitOrderSchema,
} from '@/collection/server-logic'
import type { CollectionOrderDetail, UserOrderPage } from '@/collection/types'
import type { DB, schema } from '@/db'

/** 收款账户的数据库行。 */
type CollectionAccountRow = (typeof schema.collectionAccounts)['$inferSelect']

/**
 * 核销型支付的 server functions。
 *
 * 这里是**薄边界**：取依赖、跑门禁、把领域错误翻译成响应。可测的判断都在
 * `server-logic.ts` 与领域层，server function 自己不做业务判断。
 *
 * 三条硬规则贯穿本文件：
 *
 * - **返回错误而不是抛出错误**：框架把 handler 返回的 `Response` 原样发给客户端
 *   （状态码与响应体都保留），而抛出的 `Response` 在服务端渲染与浏览器里表现
 *   不一致（前者抛出、后者 resolve）。统一「返回」，客户端只需要认一种形态。
 * - **用户身份只来自服务端会话**：客户端传的 userId / role 一律不读。
 * - **顺序固定**：模块门禁 → 服务端会话 → 角色 → 限流 → 参数校验 → 领域函数。
 *   参数校验刻意放在 handler 内而不是 `.validator()` 里 —— `.validator()` 在
 *   门禁之前就跑，会让「模块关闭时还要不要解析入参」这件事失去意义。
 */

/**
 * 提交给 server function 的载荷类型。
 *
 * 本文件的 server function 刻意不用 `.validator()`（门禁顺序要求参数校验在
 * 会话与限流之后，见文件头的注释），因此客户端侧的调用类型里 `data` 被推成
 * `undefined`。载荷形状由服务端的 Zod schema 在运行时校验，这里只在类型层面
 * 描述同一个形状；两侧不一致会以 400 `INVALID_INPUT` 显现，不会静默。
 */
export interface CallWith<D> {
  /**
   * 形状对齐 `FetcherBaseOptions`（headers / signal / fetch 由底层透传），
   * 只把 `data` 从 `undefined` 覆写成真实载荷。返回类型保持原样：成功数据按
   * 本文件的返回注解流回，`Response` 仍需 `instanceof` 收窄。
   */
  (opts: { data: D; headers?: HeadersInit; signal?: AbortSignal }): Promise<unknown>
}

/** 取门禁所需的依赖。 */
async function guardDeps(): Promise<CollectionGuardDeps> {
  const [
    { getModuleUnavailableResponse },
    { getServerContext },
    { getAuth },
    { getRequestHeaders },
    { checkRateLimit },
  ] = await Promise.all([
    import('@/lib/module-access.server'),
    import('@/lib/server-context'),
    import('@/auth/auth'),
    import('@tanstack/react-start/server'),
    import('@/lib/rate-limit'),
  ])

  const headers = await getRequestHeaders()
  return {
    module: () => getModuleUnavailableResponse('collection'),
    session: async () => {
      const env = getServerContext().env
      const session = await getAuth(env).api.getSession({ headers })
      if (!session) return null
      return { userId: session.user.id, role: session.user.role ?? 'user' }
    },
    rateLimit: checkRateLimit,
    // `cf-connecting-ip` 可信；`x-forwarded-for` 可伪造，不用。
    ip: headers.get('cf-connecting-ip') ?? 'unknown',
  }
}

/** 取数据库连接。 */
async function collectionDb() {
  const [{ createDb }, { getServerContext }] = await Promise.all([
    import('@/db'),
    import('@/lib/server-context'),
  ])
  return createDb(getServerContext().env.DB)
}

/**
 * 对象存储绑定是否可用。
 *
 * 绑定只在服务端可见，所以「能不能上传凭证」必须由服务端回答：页面若自己
 * 静态导入服务端上下文，`node:async_hooks` 会进浏览器 bundle，整站水合失败。
 */
async function hasStorageBinding(): Promise<boolean> {
  const { getServerContext } = await import('@/lib/server-context')
  return Boolean(getServerContext().env?.BUCKET)
}

/**
 * 三个管理员动作的**可注入实现**：门禁 → 参数校验 → 领域层，整段都在这里。
 *
 * `createServerFn` 的接线由 vite 插件在构建期改写，单元测试里驱动不了 server
 * function 本身（见 `tests/unit/collection-server.test.ts` 的说明）。把依赖全部
 * 注入之后，越权与参数校验能被单测直接驱动，server function 只剩接线。
 */

/** 管理员动作共享的运行时依赖。 */
export interface AdminActionDeps {
  /** 门禁依赖：模块开关、服务端会话、角色、限流。 */
  guard: CollectionGuardDeps
  /** 惰性取库：门禁不通过时不该碰数据库。 */
  db: () => Promise<DB>
}

/** 管理员订单列表：门禁 → 参数校验 → 领域层。 */
export async function adminListOrders(
  { guard, db }: AdminActionDeps,
  data: unknown,
): Promise<AdminOrderPage | Response> {
  const gate = await guardCollectionRequest(guard, { requireAdmin: true })
  if (!gate.ok) return gate.response

  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const parsed = adminOrderListSchema.safeParse({
    status: raw.status,
    limit: raw.limit,
    offset: raw.offset,
  })
  if (!parsed.success) return errorResponse('INVALID_INPUT')
  const query = resolveAdminOrderQuery(parsed.data)

  try {
    const { listAllOrders } = await import('@/collection/orders')
    return await listAllOrders(await db(), {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    })
  } catch (error) {
    return failureResponse(error)
  }
}

/** 管理员核验订单：门禁 → 参数校验 → 领域层。 */
export async function adminReviewOrder(
  { guard, db }: AdminActionDeps,
  data: unknown,
): Promise<{ status: string } | Response> {
  const gate = await guardCollectionRequest(guard, {
    requireAdmin: true,
    limit: 'review-order',
  })
  if (!gate.ok) return gate.response

  const parsed = reviewOrderSchema.safeParse(data)
  if (!parsed.success) return errorResponse('INVALID_INPUT')

  try {
    const { reviewOrder } = await import('@/collection/settlement')
    const order = await reviewOrder(await db(), {
      reviewerId: gate.session.userId,
      ...parsed.data,
    })
    return { status: order.status }
  } catch (error) {
    return failureResponse(error)
  }
}

/**
 * 管理员保存收款账户：门禁 → 参数校验 → 落库。
 *
 * 数据库只是「覆盖」：账户清单仍在源码配置里，这里改的是显示名、二维码与启用
 * 状态。数据库里没有的账户会补一行。
 */
export async function adminSaveAccount(
  { guard, db }: AdminActionDeps,
  data: unknown,
): Promise<{ ok: true } | Response> {
  const gate = await guardCollectionRequest(guard, { requireAdmin: true })
  if (!gate.ok) return gate.response

  const parsed = collectionAccountSchema.safeParse(data)
  if (!parsed.success) return errorResponse('INVALID_INPUT')

  try {
    const { schema } = await import('@/db')
    const now = new Date()
    await (await db())
      .insert(schema.collectionAccounts)
      .values({
        id: parsed.data.accountId,
        channel: 'alipay',
        displayName: parsed.data.displayName,
        currency: 'cny',
        qrImageKey: parsed.data.qrImageKey ?? null,
        enabled: parsed.data.enabled,
        updatedBy: gate.session.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.collectionAccounts.id,
        set: {
          displayName: parsed.data.displayName,
          qrImageKey: parsed.data.qrImageKey ?? null,
          enabled: parsed.data.enabled,
          updatedBy: gate.session.userId,
          updatedAt: now,
        },
      })
    return { ok: true }
  } catch (error) {
    return failureResponse(error)
  }
}

/** 用户创建订单：分配一个唯一的应付金额。 */
export const createCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ id: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'create-order' })
    if (!guard.ok) return guard.response

    const parsed = createOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { createOrder } = await import('@/collection/orders')
      const order = await createOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { id: order.id }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户申报「我已支付」。 */
export const submitCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'submit-order' })
    if (!guard.ok) return guard.response

    const parsed = submitOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { submitOrder } = await import('@/collection/orders')
      const order = await submitOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { status: order.status }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户取消未支付的订单。 */
export const cancelCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps())
    if (!guard.ok) return guard.response

    const parsed = cancelOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { cancelOrder } = await import('@/collection/orders')
      const order = await cancelOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { status: order.status }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 读取自己的订单详情。 */
export const fetchCollectionOrderFn = createServerFn({ method: 'GET' }).handler(
  async ({ data }): Promise<CollectionOrderDetail | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'poll-order' })
    if (!guard.ok) return guard.response

    const parsed = orderIdSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { getUserOrder } = await import('@/collection/orders')
      const order = await getUserOrder(
        await collectionDb(),
        guard.session.userId,
        parsed.data.orderId,
      )
      // 他人的订单与不存在的订单不可区分。
      if (!order) return errorResponse('ORDER_NOT_FOUND')
      return { order, canUpload: await hasStorageBinding() }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户自己的订单列表。 */
export const fetchMyCollectionOrdersFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserOrderPage | Response> => {
    const guard = await guardCollectionRequest(await guardDeps())
    if (!guard.ok) return guard.response

    try {
      const { listUserOrders } = await import('@/collection/orders')
      return await listUserOrders(await collectionDb(), { userId: guard.session.userId })
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 管理员读取订单队列，默认只看待核验。 */
export const fetchAdminCollectionOrdersFn = createServerFn({ method: 'GET' }).handler(
  async ({ data }): Promise<AdminOrderPage | Response> =>
    adminListOrders({ guard: await guardDeps(), db: collectionDb }, data),
)

/** 管理员核验订单。 */
export const reviewCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> =>
    adminReviewOrder({ guard: await guardDeps(), db: collectionDb }, data),
)

/** 管理员读取收款账户。 */
export const fetchCollectionAccountsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CollectionAccountRow[] | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { requireAdmin: true })
    if (!guard.ok) return guard.response

    try {
      const [{ createDb, schema }, { getServerContext }] = await Promise.all([
        import('@/db'),
        import('@/lib/server-context'),
      ])
      const db = createDb(getServerContext().env.DB)
      return await db.select().from(schema.collectionAccounts)
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/**
 * 管理员保存收款账户（按 ID upsert）。
 *
 * 数据库只是「覆盖」：账户清单仍在源码配置里，这里改的是显示名、二维码与启用
 * 状态。数据库里没有的账户会补一行。
 */
export const saveCollectionAccountFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ ok: true } | Response> =>
    adminSaveAccount({ guard: await guardDeps(), db: collectionDb }, data),
)
