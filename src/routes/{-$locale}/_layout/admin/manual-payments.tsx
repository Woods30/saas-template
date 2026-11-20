import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDate } from '@/components/local-date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { adminRoutes } from '@/config/routes'
import { websiteConfig } from '@/config/website'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminManualPaymentOrder,
  type AdminOrderPage,
  type CallWith,
  fetchAdminManualPaymentOrdersFn,
  fetchManualPaymentAccountsFn,
  type ManualPaymentOrderStatus,
  reviewManualPaymentOrderFn,
  saveManualPaymentAccountFn,
} from '@/modules/manual-payments/service'
import { productNameForProductId } from '@/modules/subscriptions/service'

/**
 * 管理台核销订单队列与收款账户运营。
 *
 * 权限在 loader 的 server function 里再校验一次：只靠 `beforeLoad` 隐藏入口
 * 拦不住直接调用。列表数据（订单、账户）都来自模块的 server function，
 * 失败契约是「返回 `Response`」，页面按稳定错误码分支，不自己造码。
 *
 * 页面与「支付订单」不是一回事：那边看的是 Stripe / Creem 的流水，这边看的是
 * 收款码的**人工核验队列**，两条链路各有一页。
 */

/** 管理员订单队列的查询载荷。 */
interface AdminOrderQuery {
  status?: string
  limit: number
  offset: number
}

/** 管理员核验订单的载荷。 */
interface AdminReviewPayload {
  orderId: string
  action: 'approve' | 'approve_exception' | 'reject'
  observedAmount: number | null
  reviewNote: string | null
  externalReference: string | null
}

/** 管理员保存收款账户的载荷。 */
interface AdminAccountPayload {
  accountId: string
  displayName: string
  enabled: boolean
}

export const Route = createFileRoute('/{-$locale}/_layout/admin/manual-payments')({
  // 模块关闭时整页 404（父级 `_layout/admin` 已做管理员门禁）。
  beforeLoad: () => assertPageEnabled('manualPayments'),
  // 页码与筛选放 URL：刷新与分享链接能停在原处，也符合「URL 即状态」的路由数据流。
  validateSearch: (search: Record<string, unknown>): { page?: number; status?: string } => {
    const parsed = Number(search.page)
    const raw = search.status
    return {
      page: Number.isInteger(parsed) && parsed > 1 ? parsed : undefined,
      // 默认筛选是页面兜底的「等待人工核验」，不必写进 URL；
      // 「全部」与默认结果不同，要保留才能区分。
      status: typeof raw === 'string' && raw && raw !== 'pending_verification' ? raw : undefined,
    }
  },
  loaderDeps: ({ search }) => ({
    status: typeof search.status === 'string' ? search.status : undefined,
    page: typeof search.page === 'number' ? search.page : 1,
  }),
  loader: async ({ deps }) => {
    // 服务端校验角色；普通用户在这里被 403 挡下，页面渲染不出任何数据。
    const result = await listAdminOrders({
      status: deps.status,
      limit: DEFAULT_PAGE_SIZE,
      offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
    })
    const accounts = await fetchManualPaymentAccountsFn()
    return {
      ok: !(result instanceof Response) && !(accounts instanceof Response),
      page: result instanceof Response ? null : result,
      accounts: accounts instanceof Response ? [] : accounts,
    }
  },
  head: () => adminHead(adminRoutes.manualPayments),
  component: AdminManualPaymentOrdersComponent,
})

/** 调用管理员订单列表的 server function。 */
async function listAdminOrders(query: AdminOrderQuery): Promise<AdminOrderPage | Response> {
  const fn = fetchAdminManualPaymentOrdersFn as unknown as CallWith<AdminOrderQuery>
  return (await fn({ data: query })) as AdminOrderPage | Response
}

/** 调用管理员核验订单的 server function。 */
async function reviewOrder(payload: AdminReviewPayload): Promise<{ status: string } | Response> {
  const fn = reviewManualPaymentOrderFn as unknown as CallWith<AdminReviewPayload>
  return (await fn({ data: payload })) as { status: string } | Response
}

/** 调用管理员保存收款账户的 server function。 */
async function saveAccount(payload: AdminAccountPayload): Promise<{ ok: true } | Response> {
  const fn = saveManualPaymentAccountFn as unknown as CallWith<AdminAccountPayload>
  return (await fn({ data: payload })) as { ok: true } | Response
}

/** 订单状态 → 文案键。文案在渲染期经 `m[key]()` 求值以跟随请求语言。 */
export function manualPaymentAdminOrderStatusMessageKey(status: ManualPaymentOrderStatus) {
  switch (status) {
    case 'pending_payment':
      return 'manual_payments_admin.status_pending_payment'
    case 'pending_verification':
      return 'manual_payments_admin.status_pending_verification'
    case 'settling':
      return 'manual_payments_admin.status_settling'
    case 'settled':
      return 'manual_payments_admin.status_settled'
    case 'expired':
      return 'manual_payments_admin.status_expired'
    case 'canceled':
      return 'manual_payments_admin.status_canceled'
    case 'rejected':
      return 'manual_payments_admin.status_rejected'
    case 'requires_refund':
      return 'manual_payments_admin.status_requires_refund'
    default:
      return 'manual_payments_admin.status_pending_payment'
  }
}

/** 核验动作的表单状态。 */
interface ReviewForm {
  observedAmount: string
  externalReference: string
  reviewNote: string
}

/** 收款账户的展示视图：源码配置与数据库覆盖合并后的结果。 */
interface AccountView {
  id: string
  displayName: string
  enabled: boolean
  /** 是否命中数据库覆盖行。 */
  fromDb: boolean
  /** 数据库里的二维码 key；有值时走服务端端点取图。 */
  qrImageKey: string | null
  /** 源码配置里的二维码地址；数据库覆盖行没有它。 */
  configuredQrImageUrl: string | null
}

const EMPTY_FORM: ReviewForm = { observedAmount: '', externalReference: '', reviewNote: '' }

function AdminManualPaymentOrdersComponent() {
  const router = useRouter()
  const loaded = Route.useLoaderData()
  const { page = 1, status = 'pending_verification' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reviewTarget, setReviewTarget] = useState<AdminManualPaymentOrder | null>(null)
  const [form, setForm] = useState<ReviewForm>(EMPTY_FORM)
  const [exceptionConfirm, setExceptionConfirm] = useState(false)

  /** 观察到的到账金额（分）；输入是元，换算回分给服务端。 */
  function observedAmountCents(): number | null {
    if (!reviewTarget) return null
    const value = Number.parseFloat(form.observedAmount)
    if (!Number.isFinite(value)) return null
    return Math.round(value * 100)
  }

  /** 普通通过只认「输入金额 = 应付金额」；差一分都不能走普通通道。 */
  function approveEnabled(): boolean {
    const cents = observedAmountCents()
    return cents !== null && reviewTarget !== null && cents === reviewTarget.payableAmount
  }

  /** 异常通过与驳回都要求非空备注。 */
  function noteFilled(): boolean {
    return form.reviewNote.trim().length > 0
  }

  async function submitReview(action: 'approve' | 'approve_exception' | 'reject') {
    if (!reviewTarget) return
    setBusy(true)
    setError(null)
    const result = await reviewOrder({
      orderId: reviewTarget.id,
      action,
      observedAmount: action === 'reject' ? null : observedAmountCents(),
      reviewNote: form.reviewNote.trim() || null,
      externalReference: form.externalReference.trim() || null,
    })
    setBusy(false)
    if (result instanceof Response) {
      setError(m['manual_payments_admin.error_generic']())
      return
    }
    setReviewTarget(null)
    setForm(EMPTY_FORM)
    toast.add({ type: 'success', title: m['manual_payments_admin.review_done']() })
    await router.invalidate()
  }

  const toggleAccount = useCallback(
    async (accountId: string, enabled: boolean, displayName: string) => {
      setBusy(true)
      setError(null)
      const result = await saveAccount({ accountId, displayName, enabled })
      setBusy(false)
      if (result instanceof Response) {
        setError(m['manual_payments_admin.error_generic']())
        return
      }
      toast.add({
        type: 'success',
        title: enabled
          ? m['manual_payments_admin.account_enabled']()
          : m['manual_payments_admin.account_disabled'](),
      })
      await router.invalidate()
    },
    [router],
  )

  /**
   * 账户区块的展示视图：源码配置与数据库覆盖合并。
   *
   * 数据库只是「覆盖」——账户清单仍在源码配置里。合并规则：
   * - 配置里有、数据库也有 → 用数据库的显示名与二维码，标「数据库覆盖」；
   * - 配置里有、数据库没有 → 用配置兜底，标「源码配置」；
   * - 数据库里有、配置里没有 → 纯覆盖行，标「数据库覆盖」（配置被移除后
   *   它不再参与解析，但管理员仍要能看到并清理它）。
   */
  const accountViews = useMemo<AccountView[]>(() => {
    const byId = new Map(loaded.accounts.map((row) => [row.id, row]))
    const configured = websiteConfig.manualPayments.accounts
    const views: AccountView[] = configured.map((item) => {
      const override = byId.get(item.id)
      return {
        id: item.id,
        displayName: override?.displayName ?? item.displayName,
        enabled: override?.enabled ?? true,
        fromDb: override !== undefined,
        qrImageKey: override?.qrImageKey ?? null,
        configuredQrImageUrl: item.qrImageUrl,
      }
    })
    for (const row of loaded.accounts) {
      if (!configured.some((item) => item.id === row.id)) {
        views.push({
          id: row.id,
          displayName: row.displayName,
          enabled: row.enabled,
          fromDb: true,
          qrImageKey: row.qrImageKey,
          configuredQrImageUrl: null,
        })
      }
    }
    return views
  }, [loaded.accounts])

  const orderColumns = useMemo<DataTableColumn<AdminManualPaymentOrder>[]>(
    () => [
      {
        id: 'orderNo',
        header: m['manual_payments_admin.col_order_id'](),
        className: 'font-mono text-xs',
        cell: (order) => order.orderNo,
      },
      {
        id: 'buyer',
        header: m['manual_payments_admin.col_buyer'](),
        className: 'max-w-[220px] truncate',
        cell: (order) => order.email,
      },
      {
        id: 'product',
        header: m['manual_payments_admin.col_product'](),
        cell: (order) => productNameForProductId(order.productId) ?? order.productId,
      },
      {
        id: 'amount',
        header: m['manual_payments_admin.col_amount'](),
        cell: (order) => formatMoney(order.payableAmount, order.currency, locale),
      },
      {
        id: 'submittedAt',
        header: m['manual_payments_admin.col_submitted_at'](),
        cell: (order) => <LocalDate value={order.submittedAt} locale={locale} />,
      },
      {
        id: 'note',
        header: m['manual_payments_admin.col_note'](),
        className: 'max-w-[200px] truncate',
        cell: (order) => order.payerNote ?? '—',
      },
      {
        id: 'receipt',
        header: m['manual_payments_admin.col_receipt'](),
        cell: (order) =>
          order.receiptKey ? (
            // key 不出现在 URL：凭证只能走服务端端点读取。
            <img
              src={`/api/manual-payments/orders/${order.id}/receipt`}
              alt={m['manual_payments_admin.receipt_alt']()}
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {m['manual_payments_admin.receipt_missing']()}
            </span>
          ),
      },
      {
        id: 'status',
        header: m['manual_payments_admin.col_status'](),
        cell: (order) => (
          <Badge variant={order.status === 'settled' ? 'default' : 'secondary'}>
            {m[manualPaymentAdminOrderStatusMessageKey(order.status)]()}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: m['manual_payments_admin.col_actions'](),
        cell: (order) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReviewTarget(order)
              setForm(EMPTY_FORM)
            }}
          >
            {m['manual_payments_admin.review_open']()}
          </Button>
        ),
      },
    ],
    [locale],
  )

  const accountColumns = useMemo<DataTableColumn<AccountView>[]>(
    () => [
      {
        id: 'accountId',
        header: m['manual_payments_admin.col_account_id'](),
        className: 'font-mono text-xs',
        cell: (view) => view.id,
      },
      {
        id: 'accountName',
        header: m['manual_payments_admin.col_account_name'](),
        cell: (view) => view.displayName,
      },
      {
        id: 'qr',
        header: m['manual_payments_admin.col_qr'](),
        cell: (view) =>
          view.qrImageKey ? (
            // 数据库覆盖的二维码走服务端端点读取。
            <img
              src={`/api/manual-payments/accounts/${view.id}/qrcode`}
              alt={m['manual_payments_admin.qr_alt']()}
              className="h-12 w-12 rounded object-cover"
            />
          ) : view.configuredQrImageUrl ? (
            // 源码配置的地址直接引用：它本来就是站内路径或无凭据 HTTPS。
            <img
              src={view.configuredQrImageUrl}
              alt={m['manual_payments_admin.qr_alt']()}
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'source',
        header: m['manual_payments_admin.col_source'](),
        cell: (view) =>
          view.fromDb ? (
            <Badge variant="secondary">{m['manual_payments_admin.db_override']()}</Badge>
          ) : (
            <Badge variant="outline">{m['manual_payments_admin.source_config']()}</Badge>
          ),
      },
      {
        id: 'accountActions',
        header: m['manual_payments_admin.col_actions'](),
        cell: (view) => (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void toggleAccount(view.id, !view.enabled, view.displayName)}
          >
            {view.enabled
              ? m['manual_payments_admin.disable']()
              : m['manual_payments_admin.enable']()}
          </Button>
        ),
      },
    ],
    [busy, toggleAccount],
  )

  return (
    <div className="space-y-6">
      {/* 订单队列 */}
      <section className="space-y-4">
        <DataTable
          columns={orderColumns}
          data={loaded.page?.rows ?? []}
          rowKey={(order) => order.id}
          error={error ?? (loaded.ok ? null : m['manual_payments_admin.error_generic']())}
          emptyTitle={m['manual_payments_admin.empty']()}
          pagination={{
            page,
            pageSize: DEFAULT_PAGE_SIZE,
            total: loaded.page?.total ?? 0,
            onPageChange: (next) =>
              void navigate({
                search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }),
              }),
          }}
          toolbar={
            <Select
              value={status}
              onValueChange={(value) => {
                if (!value) return
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    // 默认筛选不进 URL：与 `validateSearch` 的规范化保持一致。
                    status: value === 'pending_verification' ? undefined : value,
                    page: undefined,
                  }),
                })
              }}
              items={statusFilterItems()}
            >
              <SelectTrigger size="sm" aria-label={m['manual_payments_admin.filter_status']()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterItems().map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </section>

      {/* 收款账户：源码配置账户与数据库覆盖合并展示。 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">{m['manual_payments_admin.accounts_title']()}</h3>
        <DataTable
          columns={accountColumns}
          data={accountViews}
          rowKey={(view) => view.id}
          emptyTitle={m['manual_payments_admin.accounts_empty']()}
        />
        <p className="text-xs text-muted-foreground">
          {m['manual_payments_admin.accounts_note']()}
        </p>
      </section>

      {/* 核验表单 */}
      <Dialog
        open={reviewTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null)
            setForm(EMPTY_FORM)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m['manual_payments_admin.review_title']({ id: reviewTarget?.id ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {m['manual_payments_admin.review_description']({
                amount: reviewTarget
                  ? formatMoney(reviewTarget.payableAmount, reviewTarget.currency, locale)
                  : '',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-payments-admin-observed-amount">
                {m['manual_payments_admin.observed_amount']()}
              </Label>
              <Input
                id="manual-payments-admin-observed-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.observedAmount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, observedAmount: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-payments-admin-external-reference">
                {m['manual_payments_admin.external_reference']()}
              </Label>
              <Input
                id="manual-payments-admin-external-reference"
                value={form.externalReference}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, externalReference: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-payments-admin-review-note">
                {m['manual_payments_admin.review_note']()}
              </Label>
              <Input
                id="manual-payments-admin-review-note"
                value={form.reviewNote}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reviewNote: event.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setReviewTarget(null)}
            >
              {m['manual_payments_admin.cancel']()}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !noteFilled()}
              onClick={() => void submitReview('reject')}
            >
              {m['manual_payments_admin.reject']()}
            </Button>
            {/* 金额不符时普通通过不可提交：差一分都不能走普通通道。 */}
            <Button
              size="sm"
              disabled={busy || !approveEnabled()}
              onClick={() => void submitReview('approve')}
            >
              {m['manual_payments_admin.approve']()}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !noteFilled()}
              onClick={() => setExceptionConfirm(true)}
            >
              {m['manual_payments_admin.approve_exception']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 异常通过二次确认：明示金额差异与影响。 */}
      <AlertDialog open={exceptionConfirm} onOpenChange={setExceptionConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m['manual_payments_admin.exception_title']()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m['manual_payments_admin.exception_description']({
                observed:
                  reviewTarget && observedAmountCents() !== null
                    ? formatMoney(observedAmountCents() ?? 0, reviewTarget.currency, locale)
                    : '',
                expected: reviewTarget
                  ? formatMoney(reviewTarget.payableAmount, reviewTarget.currency, locale)
                  : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m['manual_payments_admin.cancel']()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExceptionConfirm(false)
                void submitReview('approve_exception')
              }}
            >
              {m['manual_payments_admin.confirm']()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 状态筛选的选项；渲染期构造以跟随语言。 */
function statusFilterItems(): { value: string; label: string }[] {
  return [
    { value: 'pending_payment', label: m['manual_payments_admin.status_pending_payment']() },
    {
      value: 'pending_verification',
      label: m['manual_payments_admin.status_pending_verification'](),
    },
    { value: 'settling', label: m['manual_payments_admin.status_settling']() },
    { value: 'settled', label: m['manual_payments_admin.status_settled']() },
    { value: 'expired', label: m['manual_payments_admin.status_expired']() },
    { value: 'canceled', label: m['manual_payments_admin.status_canceled']() },
    { value: 'rejected', label: m['manual_payments_admin.status_rejected']() },
    { value: 'requires_refund', label: m['manual_payments_admin.status_requires_refund']() },
    { value: 'all', label: m['manual_payments_admin.filter_all']() },
  ]
}
