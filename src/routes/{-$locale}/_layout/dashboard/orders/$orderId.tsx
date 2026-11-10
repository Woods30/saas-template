import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type CollectionOrderErrorCode,
  cancelCollectionOrder,
  collectionOrderErrorMessage,
  collectionOrderNeedsCountdown,
  collectionOrderNeedsPolling,
  collectionQrSrc,
  fetchCollectionOrder,
  submitCollectionOrder,
} from '@/collection/client'
import { formatMoneyAmount } from '@/collection/pricing'
import { COLLECTION_PAYER_NOTE_MAX_LENGTH, type CollectionOrder } from '@/collection/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { productNameForProductId } from '@/payment/billing-query'
import { collectionOrderStatusMessageKey } from '../orders'

/**
 * 核销订单详情：精确金额、15 分钟倒计时、收款二维码、申报与轮询。
 *
 * 三条硬规则：
 *
 * - **倒计时只展示服务端事实**：以 loader 里服务端给的 `expiresAt` 为基准换算，
 *   客户端不自行推断有效期；到 0 后立即向服务端要一次最新状态（惰性过期在那里发生）。
 * - **轮询只在需要时进行**：申报后（`pending_verification`）与结算中（`settling`）
 *   每 5 秒拉一次；进入终态或卸载时清理定时器。
 * - **「我已支付」只是申报**：申报成功进入待核验，页面绝不自行显示「已到账」——
 *   到账是管理员核验后由轮询拿回的服务端状态。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/orders/$orderId')({
  beforeLoad: () => assertPageEnabled('collection'),
  loader: async ({ params }) => {
    try {
      const result = await fetchCollectionOrder({ orderId: params.orderId })
      if (result.kind === 'ok') {
        return {
          ok: true as const,
          orderId: params.orderId,
          order: result.order,
          // 对象存储绑定只在服务端可见，由 server function 一并带回；
          // 没有 BUCKET 时上传入口隐藏，说明仍可填。
          canUpload: result.canUpload,
        }
      }
      return {
        ok: false as const,
        orderId: params.orderId,
        order: null,
        canUpload: false,
        errorCode: result.kind === 'missing' ? ('ORDER_NOT_FOUND' as const) : result.code,
      }
    } catch {
      return {
        ok: false as const,
        orderId: params.orderId,
        order: null,
        canUpload: false,
        errorCode: 'INTERNAL_ERROR' as const,
      }
    }
  },
  head: () =>
    seo('/dashboard/orders', {
      title: m['collection.order_detail_title'](),
      description: m['collection.order_detail_description'](),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: OrderDetailPage,
})

/** 轮询间隔（毫秒）：设计说明第 8 节定为 5 秒。 */
const POLL_INTERVAL_MS = 5000
/** 倒计时刷新间隔（毫秒）。 */
const COUNTDOWN_INTERVAL_MS = 1000

/** 按服务端到期时间换算的剩余毫秒；已到期为 0。 */
function remainingMs(expiresAt: Date | string, now: number): number {
  return Math.max(0, new Date(expiresAt).getTime() - now)
}

/** 剩余毫秒 → `mm:ss`。 */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function OrderDetailPage() {
  const loaded = Route.useLoaderData()
  const locale = getRequestLocale()
  const [order, setOrder] = useState<CollectionOrder | null>(loaded.order)
  const [error, setError] = useState<string | null>(
    loaded.ok || !loaded.errorCode ? null : collectionOrderErrorMessage(loaded.errorCode),
  )
  const [submitting, setSubmitting] = useState(false)
  const [payerNote, setPayerNote] = useState(order?.payerNote ?? '')
  const [uploading, setUploading] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  // 倒计时基准：挂载时取一次客户端时钟，之后只做加法，避免休眠后跳变。
  const [now, setNow] = useState(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const result = await fetchCollectionOrder({ orderId: loaded.orderId })
    if (result.kind === 'ok') setOrder(result.order)
  }, [loaded.orderId])

  // 到期时间以服务端 `expiresAt` 为唯一事实源；到 0 时立刻要一次最新状态，
  // 惰性过期由服务端完成，客户端不自行把状态改成「已过期」。
  // 订单到达终态（不再显示倒计时）或卸载时停表。
  useEffect(() => {
    if (!order || !collectionOrderNeedsCountdown(order.status)) return
    if (remainingMs(order.expiresAt, Date.now()) <= 0) {
      void refresh()
      return
    }
    timerRef.current = setInterval(() => {
      setNow(Date.now())
    }, COUNTDOWN_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [order, refresh])

  // 轮询只在「申报后」与「结算中」进行；进入终态或卸载时清理定时器。
  useEffect(() => {
    if (!order || !collectionOrderNeedsPolling(order.status)) return
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [order, refresh])

  const qrSrc = order ? collectionQrSrc(order) : null
  const productName = order ? (productNameForProductId(order.productId) ?? order.productId) : ''
  const hasReceipt = Boolean(order?.receiptKey)
  const receiptSrc = hasReceipt ? `/api/collection/orders/${loaded.orderId}/receipt` : null

  async function declare() {
    if (!order || submitting) return
    setSubmitting(true)
    setError(null)
    const result = await submitCollectionOrder({
      orderId: order.id,
      payerNote: payerNote.trim() || null,
    })
    setSubmitting(false)
    if (result.kind === 'error') {
      setError(collectionOrderErrorMessage(result.code as CollectionOrderErrorCode))
      return
    }
    // 申报成功后立即要一次最新状态（含服务端时间戳），并启动轮询。
    await refresh()
  }

  async function cancel() {
    if (!order || submitting) return
    setSubmitting(true)
    setError(null)
    const result = await cancelCollectionOrder({ orderId: order.id })
    setSubmitting(false)
    if (result.kind === 'error') {
      setError(collectionOrderErrorMessage(result.code as CollectionOrderErrorCode))
      return
    }
    await refresh()
  }

  async function uploadReceipt(file: File) {
    if (!order) return
    setUploading(true)
    setUploadNotice(null)
    try {
      const body = new FormData()
      // 字段名由服务端读取（`file`）；key 由服务端查库决定，客户端不传。
      body.append('file', file)
      const response = await fetch(`/api/collection/orders/${order.id}/receipt`, {
        method: 'POST',
        body,
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        setUploadNotice(
          payload?.error
            ? collectionOrderErrorMessage(payload.error as CollectionOrderErrorCode)
            : m['collection.error_generic'](),
        )
        return
      }
      setUploadNotice(m['collection.order_receipt_uploaded']())
      await refresh()
    } catch {
      setUploadNotice(m['collection.error_generic']())
    } finally {
      setUploading(false)
    }
  }

  if (!loaded.ok || !order) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{m['collection.order_detail_title']()}</h1>
        </header>
        <p role="alert" className="text-destructive">
          {error ?? m['collection.order_not_found']()}
        </p>
        <Button
          variant="outline"
          render={<Link to="/{-$locale}/dashboard/orders" params={{ locale }} />}
        >
          {m['collection.order_back_to_list']()}
        </Button>
      </div>
    )
  }

  const remaining = remainingMs(order.expiresAt, now)
  const canDeclare = order.status === 'pending_payment' && remaining > 0
  const canCancel = order.status === 'pending_payment'

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{m['collection.order_detail_title']()}</h1>
        <Badge>{m[collectionOrderStatusMessageKey(order.status)]()}</Badge>
      </header>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{m['collection.error_heading']()}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{m['collection.order_summary_title']()}</CardTitle>
            <CardDescription className="font-mono text-xs">{order.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{m['collection.order_product']()}</p>
              <p className="text-lg font-semibold">{productName}</p>
              {order.kind === 'subscription' && order.interval && (
                <p className="text-sm text-muted-foreground">
                  {m['collection.order_subscription_note']({
                    intervalCount: order.intervalCount ?? 1,
                    interval: order.interval,
                  })}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{m['collection.order_payable']()}</p>
              <p className="text-3xl font-semibold tabular-nums" data-testid="payable-amount">
                {formatMoneyAmount(order.payableAmount, order.currency, locale)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {m['collection.order_exact_amount_note']()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{m['collection.order_time_left']()}</p>
              <p
                className="text-2xl font-semibold tabular-nums"
                role="timer"
                aria-live="off"
                data-testid="countdown"
              >
                {formatCountdown(remaining)}
              </p>
            </div>
            {canDeclare && (
              <div className="flex flex-wrap gap-3">
                <Button disabled={submitting} onClick={() => void declare()} aria-busy={submitting}>
                  {m['collection.order_declare_paid']()}
                </Button>
                {canCancel && (
                  <Button variant="outline" disabled={submitting} onClick={() => void cancel()}>
                    {m['collection.order_cancel']()}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m['collection.order_qr_title']()}</CardTitle>
            <CardDescription>{m['collection.order_qr_description']()}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={m['collection.order_qr_alt']()}
                className="size-64 rounded-lg border border-border object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {m['collection.order_qr_unavailable']()}
              </p>
            )}
            {order.payerNote && (
              <p className="text-sm text-muted-foreground">
                {m['collection.order_note_displayed']({ note: order.payerNote })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m['collection.order_note_title']()}</CardTitle>
          <CardDescription>{m['collection.order_note_description']()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collection-payer-note">{m['collection.order_note_label']()}</Label>
            <Textarea
              id="collection-payer-note"
              value={payerNote}
              maxLength={COLLECTION_PAYER_NOTE_MAX_LENGTH}
              onChange={(event) => setPayerNote(event.target.value)}
              placeholder={m['collection.order_note_placeholder']()}
            />
          </div>
          {loaded.canUpload && (
            <div className="space-y-2">
              <Label htmlFor="collection-receipt">{m['collection.order_receipt_label']()}</Label>
              <Input
                id="collection-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadReceipt(file)
                }}
              />
              <p className="text-xs text-muted-foreground">
                {m['collection.order_receipt_hint']()}
              </p>
            </div>
          )}
          {uploading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> {m['collection.order_receipt_uploading']()}
            </p>
          )}
          {uploadNotice && (
            <p role="status" className="text-sm text-muted-foreground">
              {uploadNotice}
            </p>
          )}
          {receiptSrc && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{m['collection.order_receipt_current']()}</p>
              <img
                src={receiptSrc}
                alt={m['collection.order_receipt_alt']()}
                className="max-h-48 rounded-lg border border-border"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Alert data-testid="collection-risk">
        <AlertTitle>{m['collection.order_risk_title']()}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-2 pl-4">
            <li>
              {m['collection.order_risk_manual_review']({
                hours: websiteConfig.collection.verificationSlaHours,
              })}
            </li>
            <li>{m['collection.order_risk_exact_amount']()}</li>
            <li>{m['collection.order_risk_validity']()}</li>
            <li>{m['collection.order_risk_declare_not_proof']()}</li>
            <li>{m['collection.order_risk_no_auto_charge']()}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  )
}
