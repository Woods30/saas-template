/**
 * 核销型支付的客户端辅助。
 *
 * server function（`./server`）的契约是「失败返回 `Response`、成功返回
 * 数据」。各页面都要走同一套「按稳定错误码分支」的判断，这里把它归一化成有限的
 * 几种结果，调用方不需要认识 HTTP 状态码，只需要认 `kind`。
 *
 * 三条硬规则：
 *
 * - **按码分支，不造码**：错误码是领域层定的稳定契约（`./types`），
 *   客户端只翻译展示文案，不发明新的错误分类；
 * - **失败是数据不是异常**：`Response` 会正常 resolve，绝不能用 try/catch 包它；
 * - **用户身份与金额只来自服务端**：客户端不传 userId / role / amount。
 */

import { m } from '@/locale/paraglide/messages.js'
import {
  type CallWith,
  cancelManualPaymentOrderFn,
  createManualPaymentOrderFn,
  fetchManualPaymentOrderFn,
  fetchMyManualPaymentOrdersFn,
  submitManualPaymentOrderFn,
} from './server'
import type { ManualPaymentApiErrorCode } from './server-logic'
import type { ManualPaymentOrder, ManualPaymentOrderDetail, UserOrderPage } from './types'

/** 下单结果：成功拿到订单号，或明确告诉用户下一步去哪。 */
export type ManualPaymentCheckoutOutcome =
  | { kind: 'redirect'; orderId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'not-configured' }
  | { kind: 'error'; code: ManualPaymentOrderErrorCode }

/** 客户端需要单独提示的稳定错误码；其余码统一按通用错误处理。 */
export type ManualPaymentOrderErrorCode = ManualPaymentApiErrorCode | 'INTERNAL_ERROR'

/** 读取响应体的稳定错误码；不是 JSON 或没有 `error` 字段时回退到 HTTP 状态推断。 */
async function errorCode(response: Response): Promise<ManualPaymentOrderErrorCode> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (body && typeof body.error === 'string') return body.error as ManualPaymentOrderErrorCode
  if (response.status === 401) return 'UNAUTHENTICATED'
  return 'INTERNAL_ERROR'
}

/**
 * 创建核销订单。
 *
 * 服务端返回 401 / `UNAUTHENTICATED` 的情形归为 `unauthenticated`，让首页把用户
 * 引导去登录；`MODULE_DISABLED` / `INVALID_OFFER` / `NO_MANUAL_PAYMENT_ACCOUNT` 表示
 * 本站当前收不了核销单，归为 `not-configured`。
 */
export async function createManualPaymentOrder(input: {
  productId: string
  offerId: string
}): Promise<ManualPaymentCheckoutOutcome> {
  const createOrderFn = createManualPaymentOrderFn as unknown as CallWith<{
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
      code === 'NO_MANUAL_PAYMENT_ACCOUNT'
    ) {
      return { kind: 'not-configured' }
    }
    return { kind: 'error', code }
  }
  return { kind: 'redirect', orderId: result.id }
}

/** 申报「我已支付」的结果。 */
export type ManualPaymentSubmitOutcome =
  | { kind: 'ok'; status: string }
  | { kind: 'error'; code: ManualPaymentOrderErrorCode }

/** 用户申报付款。成功时返回服务端给出的新状态（只认 `pending_verification`）。 */
export async function submitManualPaymentOrder(input: {
  orderId: string
  payerNote?: string | null
}): Promise<ManualPaymentSubmitOutcome> {
  const submitOrderFn = submitManualPaymentOrderFn as unknown as CallWith<{
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
export type ManualPaymentCancelOutcome =
  | { kind: 'ok'; status: string }
  | { kind: 'error'; code: ManualPaymentOrderErrorCode }

/** 用户取消自己的待支付订单。 */
export async function cancelManualPaymentOrder(input: {
  orderId: string
}): Promise<ManualPaymentCancelOutcome> {
  const cancelFn = cancelManualPaymentOrderFn as unknown as CallWith<{ orderId: string }>
  const result = (await cancelFn({
    data: { orderId: input.orderId },
  })) as { status: string } | Response
  if (result instanceof Response) {
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', status: result.status }
}

/** 读取订单详情的结果；`null` 表示订单不存在或不属于当前用户。 */
export type ManualPaymentOrderResult =
  | { kind: 'ok'; order: ManualPaymentOrder; canUpload: boolean }
  | { kind: 'missing' }
  | { kind: 'error'; code: ManualPaymentOrderErrorCode }

export async function fetchManualPaymentOrder(input: {
  orderId: string
}): Promise<ManualPaymentOrderResult> {
  const fetchOrderFn = fetchManualPaymentOrderFn as unknown as CallWith<{ orderId: string }>
  const result = (await fetchOrderFn({
    data: { orderId: input.orderId },
  })) as ManualPaymentOrderDetail | Response
  if (result instanceof Response) {
    if (result.status === 404) return { kind: 'missing' }
    return { kind: 'error', code: await errorCode(result) }
  }
  return { kind: 'ok', order: result.order, canUpload: result.canUpload }
}

/** 用户订单列表的结果。 */
export type ManualPaymentOrderListResult =
  | { kind: 'ok'; page: UserOrderPage }
  | { kind: 'error'; code: ManualPaymentOrderErrorCode }

export async function fetchMyManualPaymentOrders(): Promise<ManualPaymentOrderListResult> {
  const result = await fetchMyManualPaymentOrdersFn()
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
export function manualPaymentOrderErrorMessage(code: ManualPaymentOrderErrorCode): string {
  switch (code) {
    case 'MODULE_DISABLED':
      return m['manual_payments.error_module_disabled']()
    case 'INVALID_OFFER':
      return m['manual_payments.error_invalid_offer']()
    case 'NO_MANUAL_PAYMENT_ACCOUNT':
      return m['manual_payments.error_no_account']()
    case 'AMOUNT_POOL_EXHAUSTED':
      return m['manual_payments.error_amount_pool_exhausted']()
    case 'ORDER_EXPIRED':
      return m['manual_payments.error_order_expired']()
    case 'INVALID_ORDER_STATE':
      return m['manual_payments.error_invalid_state']()
    case 'ORDER_NOT_FOUND':
      return m['manual_payments.error_order_not_found']()
    case 'INVALID_PAYER_NOTE':
      return m['manual_payments.error_invalid_payer_note']()
    case 'RATE_LIMITED':
      return m['manual_payments.error_rate_limited']()
    case 'STORAGE_UNAVAILABLE':
      return m['manual_payments.error_storage_unavailable']()
    case 'INVALID_INPUT':
      return m['manual_payments.error_invalid_input']()
    case 'INVALID_QRCODE':
      return m['manual_payments.error_invalid_qrcode']()
    default:
      return m['manual_payments.error_generic']()
  }
}

/**
 * 订单详情页应显示的二维码来源。
 *
 * 服务端快照里 `qrImageKey`（R2）优先：有它时二维码必须经服务端授权端点取图，
 * 客户端拿不到也不需要裸 key。没有 R2 时退回源码配置的 `qrImageUrl`。
 */
export function manualPaymentQrSrc(
  order: Pick<ManualPaymentOrder, 'qrImageKey' | 'qrImageUrl' | 'accountId'>,
): string | null {
  if (order.qrImageKey) return `/api/manual-payments/accounts/${order.accountId}/qrcode`
  if (order.qrImageUrl) return order.qrImageUrl
  return null
}

/**
 * 订单是否仍在「需要继续盯」的状态：申报后（待核验）与结算中都要轮询，
 * 终态（到账 / 过期 / 取消 / 驳回 / 待退款）与未申报都停。
 */
export function manualPaymentOrderNeedsPolling(status: string): boolean {
  return status === 'pending_verification' || status === 'settling'
}

/**
 * 订单是否还显示倒计时：只有待支付（用户还有付款机会）需要倒计时，
 * 终态与申报后的状态都不再展示剩余时间。
 */
export function manualPaymentOrderNeedsCountdown(status: string): boolean {
  return status === 'pending_payment'
}
