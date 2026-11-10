import { z } from 'zod'
import {
  CollectionError,
  type CollectionErrorCode,
  type CollectionOrderStatus,
} from '@/collection/types'

/**
 * 核销型支付的 server 层纯逻辑：门禁顺序、错误映射、限流键与分页。
 *
 * 这些东西单独成模块，是因为 **server function 本身没法直接单测** —— 它依赖
 * 请求上下文（会话、env、KV），而且 `createServerFn` 的实现由 vite 插件改写，
 * 单元测试里调用它不会走到 handler。仓库里既有的做法也是这样：
 * `src/payment/billing-query.ts` 与 `src/payment/admin-billing-query.ts` 放可测的
 * 逻辑，`billing.ts` 只做薄包装。
 *
 * server 层只负责取依赖并调用这里的函数；业务判断一律留在这里。
 */

/**
 * API 层错误码。
 *
 * 在领域错误码之外补四个「接口级」错误：未登录、无权限、被限流、参数不合法。
 * 它们不属于任何一次具体订单，却同样只对外暴露稳定码。
 */
export type CollectionApiErrorCode =
  | CollectionErrorCode
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'INVALID_QRCODE'

/** 错误码 → HTTP 状态码。 */
const ERROR_STATUS: Record<CollectionApiErrorCode, number> = {
  // 模块关闭时与「不存在」同形，避免泄漏模块是否存在。
  MODULE_DISABLED: 404,
  SERVICE_UNAVAILABLE: 503,
  INVALID_OFFER: 400,
  NO_COLLECTION_ACCOUNT: 400,
  AMOUNT_POOL_EXHAUSTED: 409,
  ORDER_NOT_FOUND: 404,
  // 订单过期是终态，不是冲突。
  ORDER_EXPIRED: 410,
  INVALID_ORDER_STATE: 409,
  INVALID_PAYER_NOTE: 400,
  INVALID_REVIEW_NOTE: 400,
  AMOUNT_MISMATCH: 400,
  SUBSCRIPTION_SLOT_TAKEN: 409,
  SETTLEMENT_IN_PROGRESS: 409,
  STORAGE_UNAVAILABLE: 503,
  INVALID_RECEIPT: 400,
  INVALID_QRCODE: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
}

/** 错误码对应的 HTTP 状态码。未知码按 400 处理，不落到 500。 */
export function errorStatus(code: CollectionApiErrorCode): number {
  return ERROR_STATUS[code] ?? 400
}

/** 错误响应体：只回稳定错误码，不回显内部细节。 */
export function errorResponse(code: CollectionApiErrorCode): Response {
  return Response.json({ error: code }, { status: errorStatus(code) })
}

/**
 * 把处理过程中抛出的异常翻译成错误响应。
 *
 * 领域错误按自带的状态码翻译；参数错误统一 400；其余按 500 处理，不回显细节。
 */
export function failureResponse(error: unknown): Response {
  if (error instanceof CollectionError) return errorResponse(error.code)
  if (error instanceof z.ZodError) return errorResponse('INVALID_INPUT')
  return Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
}

/**
 * 限流动作。
 *
 * 限流工具只有 `ip + action` 两个维度，没有账号维度 —— 要做到「每账号限流」，
 * 只能把账号 ID 编进 action 字符串。`createCacheKey` 会把 `:` 换成 `_`，
 * 不同账号因此落在不同的 key 上。
 */
export type CollectionRateLimitAction =
  | 'create-order'
  | 'submit-order'
  | 'poll-order'
  | 'upload-receipt'
  | 'review-order'

/** 各动作的限额与窗口（秒）。 */
export const COLLECTION_RATE_LIMITS: Record<
  CollectionRateLimitAction,
  { limit: number; windowSeconds: number }
> = {
  'create-order': { limit: 5, windowSeconds: 15 * 60 },
  'submit-order': { limit: 10, windowSeconds: 60 },
  'poll-order': { limit: 60, windowSeconds: 60 },
  'upload-receipt': { limit: 5, windowSeconds: 15 * 60 },
  'review-order': { limit: 30, windowSeconds: 60 },
}

/**
 * 构造限流 action 键。
 *
 * 带 `userId` 时按账号计数（不传则按 IP 计数）。
 */
export function rateLimitAction(action: CollectionRateLimitAction, userId?: string | null): string {
  return userId ? `collection:${action}:${userId}` : `collection:${action}`
}

/** 限流检查器：由 server 层注入真实实现，测试注入假实现。 */
export type RateLimitChecker = (opts: {
  ip: string
  action: string
  limit: number
  windowSeconds: number
}) => Promise<boolean>

/**
 * 按动作执行限流检查。
 *
 * 被限流时返回 429 响应；放行时返回 `undefined`。
 */
export async function enforceRateLimit(
  check: RateLimitChecker,
  opts: {
    ip: string
    action: CollectionRateLimitAction
    userId?: string | null
  },
): Promise<Response | undefined> {
  const { limit, windowSeconds } = COLLECTION_RATE_LIMITS[opts.action]
  const allowed = await check({
    ip: opts.ip,
    action: rateLimitAction(opts.action, opts.userId),
    limit,
    windowSeconds,
  })
  return allowed ? undefined : errorResponse('RATE_LIMITED')
}

/** 服务端会话里本模块需要的部分。 */
export interface CollectionSession {
  userId: string
  role: string
}

/** 门禁所需的依赖；由 server 层注入，测试注入假实现。 */
export interface CollectionGuardDeps {
  /** 模块门禁：返回响应表示模块不可用（404 / 503）。 */
  module: () => Response | undefined
  /** 服务端会话：没有登录用户时返回 null。 */
  session: () => Promise<CollectionSession | null>
  /** 限流检查器。 */
  rateLimit: RateLimitChecker
  /** 客户端 IP。 */
  ip: string
}

/** 门禁的可选项。 */
export interface CollectionGuardOptions {
  /** 是否要求管理员角色。 */
  requireAdmin?: boolean
  /** 要限流的动作；不给就不限流。 */
  limit?: CollectionRateLimitAction
}

export type CollectionGuardResult =
  | { ok: true; session: CollectionSession }
  | { ok: false; response: Response }

/**
 * 统一门禁：模块可用性 → 服务端会话 → 角色 → 限流。
 *
 * 顺序是硬要求，不能调换：
 *
 * - 模块门禁最先跑：模块关掉时连「有没有登录」都不该泄露，也不该白白查一次
 *   会话。
 * - 会话在角色之前：角色必须来自服务端会话，客户端传什么都不作数。
 * - 限流最后：限流要按账号计数，而账号 ID 得先从会话里拿到。
 *
 * 任何一步失败都返回对应的响应，成功则交回服务端会话。
 */
export async function guardCollectionRequest(
  deps: CollectionGuardDeps,
  options: CollectionGuardOptions = {},
): Promise<CollectionGuardResult> {
  const unavailable = deps.module()
  if (unavailable) return { ok: false, response: unavailable }

  const session = await deps.session()
  if (!session) return { ok: false, response: errorResponse('UNAUTHENTICATED') }

  if (options.requireAdmin && session.role !== 'admin') {
    return { ok: false, response: errorResponse('FORBIDDEN') }
  }

  if (options.limit) {
    const limited = await enforceRateLimit(deps.rateLimit, {
      ip: deps.ip,
      action: options.limit,
      userId: session.userId,
    })
    if (limited) return { ok: false, response: limited }
  }

  return { ok: true, session }
}

/** 创建订单的入参校验。 */
export const createOrderSchema = z.object({
  productId: z.string().min(1),
  offerId: z.string().min(1),
})

/** 申报付款的入参校验。 */
export const submitOrderSchema = z.object({
  orderId: z.string().min(1),
  payerNote: z.string().max(500).nullish(),
})

/** 取消订单的入参校验。 */
export const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
})

/** 读取订单详情的入参校验。 */
export const orderIdSchema = z.object({
  orderId: z.string().min(1),
})

/** 管理员订单列表的默认筛选状态。 */
export const DEFAULT_ADMIN_ORDER_STATUS: CollectionOrderStatus = 'pending_verification'

/** 订单的全部状态。 */
export const ADMIN_ORDER_STATUSES = [
  'pending_payment',
  'pending_verification',
  'settling',
  'settled',
  'expired',
  'canceled',
  'rejected',
  'requires_refund',
] as const

/**
 * 管理员订单列表的查询参数校验。
 *
 * `status` 多一个 `'all'`：管理员偶尔要翻全部历史，只看默认的那一屏不够用。
 */
export const adminOrderListSchema = z.object({
  status: z.enum([...ADMIN_ORDER_STATUSES, 'all']).default(DEFAULT_ADMIN_ORDER_STATUS),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})

/** 管理员核验订单的入参校验。 */
export const reviewOrderSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(['approve', 'approve_exception', 'reject']),
  observedAmount: z.number().int().positive().nullish(),
  reviewNote: z.string().max(500).nullish(),
  externalReference: z.string().max(200).nullish(),
})

/** 收款账户保存的入参校验。 */
export const collectionAccountSchema = z.object({
  accountId: z.string().min(1),
  displayName: z.string().min(1).max(100),
  qrImageKey: z.string().min(1).nullish(),
  enabled: z.boolean().default(true),
})

/**
 * 解析管理员订单列表的查询参数。
 *
 * 不给状态就只看待核验 —— 那是管理员每天要处理的那一屏；显式传 `'all'` 才翻
 * 全部历史。
 *
 * limit 越界直接抛错而不是夹取：夹取会让调用方以为「就是要 20 条」，从而掩盖
 * 调用方的 bug。server 层把 ZodError 映射成 400。
 */
export function resolveAdminOrderQuery(input: {
  status?: CollectionOrderStatus | 'all' | null
  limit?: number | null
  offset?: number | null
}): { status: CollectionOrderStatus | 'all'; limit: number; offset: number } {
  const parsed = adminOrderListSchema.parse({
    status: input.status ?? undefined,
    limit: input.limit ?? undefined,
    offset: input.offset ?? undefined,
  })
  return {
    status: parsed.status,
    limit: parsed.limit,
    offset: parsed.offset,
  }
}
