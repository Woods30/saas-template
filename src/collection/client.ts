/**
 * 核销型支付的客户端辅助。
 *
 * server function（`@/collection/server`）的契约是「失败返回 `Response`、成功返回
 * 数据」。各页面都要走同一套「按稳定错误码分支」的判断，这里把它归一化成有限的
 * 几种结果，调用方不需要认识 HTTP 状态码，只需要认 `kind`。
 *
 * 三条硬规则：
 *
 * - **按码分支，不造码**：错误码是领域层定的稳定契约（`@/collection/types`），
 *   客户端只翻译展示文案，不发明新的错误分类；
 * - **失败是数据不是异常**：`Response` 会正常 resolve，绝不能用 try/catch 包它；
 * - **用户身份与金额只来自服务端**：客户端不传 userId / role / amount。
 */

import {
  type CallWith,
  cancelCollectionOrderFn,
  createCollectionOrderFn,
  fetchCollectionOrderFn,
  fetchMyCollectionOrdersFn,
  submitCollectionOrderFn,
} from '@/collection/server'
import type { CollectionApiErrorCode } from '@/collection/server-logic'
import type { CollectionOrder, CollectionOrderDetail, UserOrderPage } from '@/collection/types'
import { m } from '@/locale/paraglide/messages.js'

/** 下单结果：成功拿到订单号，或明确告诉用户下一步去哪。 */
export type CollectionCheckoutOutcome =
  | { kind: 'redirect'; orderId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'not-configured' }
  | { kind: 'error'; code: CollectionOrderErrorCode }

/** 客户端需要单独提示的稳定错误码；其余码统一按通用错误处理。 */
export type CollectionOrderErrorCode = CollectionApiErrorCode | 'INTERNAL_ERROR'

/** 读取响应体的稳定错误码；不是 JSON 或没有 `error` 字段时回退到 HTTP 状态推断。 */
async function errorCode(response: Response): Promise<CollectionOrderErrorCode> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (body && typeof body.error === 'string') return body.error as CollectionOrderErrorCode
  if (response.status === 401) return 'UNAUTHENTICATED'
  return 'INTERNAL_ERROR'
}

/**
 * 创建核销订单。
 *
 * 服务端返回 401 / `UNAUTHENTICATED` 的情形归为 `unauthenticated`，让首页把用户
 * 引导去登录；`MODULE_DISABLED` / `INVALID_OFFER` / `NO_COLLECTION_ACCOUNT` 表示
 * 本站当前收不了核销单，归为 `not-configured`。
 */
export async function createCollectionOrder(input: {
  productId: string
  offerId: string
}): Promise<CollectionCheckoutOutcome> {
  const createOrderFn = createCollectionOrderFn as unknown as CallWith<{
    productId: string
    offerId: string
  }>
  const result = (await createOrderFn({
    data: { productId: input.productId, offerId: input.offerId },
  })) as { id: string } | Response
  if (result instanceof Response) {
    const code = await errorCode(result)
    if (code === 'UNAUTHENTICATED' || result.status === 401) return { kind: 'unauthenticated' }
    if (
      code === 'MODULE_DISABLED' ||
      code === 'INVALID_OFFER' ||
      code === 'NO_COLLECTION_ACCOUNT'
    ) {
      return { kind: 'not-configured' }
    }
    return { kind: 'error', code }
  }
  return { kind: 'redirect', orderId: result.id }
}

/** 申报「我已支付」的结果。 */
export type CollectionSubmitOutcome =
  | { kind: 'ok'; status: string }
  | { kind: 'error'; code: CollectionOrderErrorCode }

/** 用户申报付款。成功时返回服务端给出的新状态（只认 `pending_verification`）。 */
export async function submitCollectionOrder(input: {
  orderId: string
  payerNote?: string | null
}): Promise<CollectionSubmitOutcome> {
  const submitOrderFn = submitCollectionOrderFn as unknown as CallWith<{
    orderId: string
    payerNote?: string | null
  }>
  const result = (await submitOrderFn({
    data: { orderId: input.orderId, payerNote: input.payerNote ?? null },
  })) as { status: string } | Response
  if (result instanceof Response) {
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', status: result.status }
}

/** 取消未支付订单的结果。 */
export type CollectionCancelOutcome =
  | { kind: 'ok'; status: string }
  | { kind: 'error'; code: CollectionOrderErrorCode }

/** 用户取消自己的待支付订单。 */
export async function cancelCollectionOrder(input: {
  orderId: string
}): Promise<CollectionCancelOutcome> {
  const cancelFn = cancelCollectionOrderFn as unknown as CallWith<{ orderId: string }>
  const result = (await cancelFn({
    data: { orderId: input.orderId },
  })) as { status: string } | Response
  if (result instanceof Response) {
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', status: result.status }
}

/** 读取订单详情的结果；`null` 表示订单不存在或不属于当前用户。 */
export type CollectionOrderResult =
  | { kind: 'ok'; order: CollectionOrder; canUpload: boolean }
  | { kind: 'missing' }
  | { kind: 'error'; code: CollectionOrderErrorCode }

export async function fetchCollectionOrder(input: {
  orderId: string
}): Promise<CollectionOrderResult> {
  const fetchOrderFn = fetchCollectionOrderFn as unknown as CallWith<{ orderId: string }>
  const result = (await fetchOrderFn({
    data: { orderId: input.orderId },
  })) as CollectionOrderDetail | Response
  if (result instanceof Response) {
    if (result.status === 404) return { kind: 'missing' }
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', order: result.order, canUpload: result.canUpload }
}

/** 用户订单列表的结果。 */
export type CollectionOrderListResult =
  | { kind: 'ok'; page: UserOrderPage }
  | { kind: 'error'; code: CollectionOrderErrorCode }

export async function fetchMyCollectionOrders(): Promise<CollectionOrderListResult> {
  const result = await fetchMyCollectionOrdersFn()
  if (result instanceof Response) {
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', page: result }
}

/**
 * 稳定错误码 → 展示文案。
 *
 * 文案在渲染期求值（`m.*()` 不进模块顶层常量），调用方在组件里直接调用本函数。
 */
export function collectionOrderErrorMessage(code: CollectionOrderErrorCode): string {
  switch (code) {
    case 'MODULE_DISABLED':
      return m['collection.error_module_disabled']()
    case 'INVALID_OFFER':
      return m['collection.error_invalid_offer']()
    case 'NO_COLLECTION_ACCOUNT':
      return m['collection.error_no_account']()
    case 'AMOUNT_POOL_EXHAUSTED':
      return m['collection.error_amount_pool_exhausted']()
    case 'ORDER_EXPIRED':
      return m['collection.error_order_expired']()
    case 'INVALID_ORDER_STATE':
      return m['collection.error_invalid_state']()
    case 'ORDER_NOT_FOUND':
      return m['collection.error_order_not_found']()
    case 'INVALID_PAYER_NOTE':
      return m['collection.error_invalid_payer_note']()
    case 'RATE_LIMITED':
      return m['collection.error_rate_limited']()
    case 'STORAGE_UNAVAILABLE':
      return m['collection.error_storage_unavailable']()
    case 'INVALID_INPUT':
      return m['collection.error_invalid_input']()
    case 'INVALID_QRCODE':
      return m['collection.error_invalid_qrcode']()
    default:
      return m['collection.error_generic']()
  }
}

/**
 * 订单详情页应显示的二维码来源。
 *
 * 服务端快照里 `qrImageKey`（R2）优先：有它时二维码必须经服务端授权端点取图，
 * 客户端拿不到也不需要裸 key。没有 R2 时退回源码配置的 `qrImageUrl`。
 */
export function collectionQrSrc(
  order: Pick<CollectionOrder, 'qrImageKey' | 'qrImageUrl' | 'accountId'>,
): string | null {
  if (order.qrImageKey) return `/api/collection/accounts/${order.accountId}/qrcode`
  if (order.qrImageUrl) return order.qrImageUrl
  return null
}

/**
 * 订单是否仍在「需要继续盯」的状态：申报后（待核验）与结算中都要轮询，
 * 终态（到账 / 过期 / 取消 / 驳回 / 待退款）与未申报都停。
 */
export function collectionOrderNeedsPolling(status: string): boolean {
  return status === 'pending_verification' || status === 'settling'
}

/**
 * 订单是否还显示倒计时：只有待支付（用户还有付款机会）需要倒计时，
 * 终态与申报后的状态都不再展示剩余时间。
 */
export function collectionOrderNeedsCountdown(status: string): boolean {
  return status === 'pending_payment'
}
