import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { AdminCollectionOrder, AdminOrderPage } from '@/collection/orders'
import { formatMoneyAmount } from '@/collection/pricing'
import {
  type CallWith,
  fetchAdminCollectionOrdersFn,
  fetchCollectionAccountsFn,
  reviewCollectionOrderFn,
  saveCollectionAccountFn,
} from '@/collection/server'
import type { CollectionOrderStatus } from '@/collection/types'
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
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled, assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { productNameForProductId } from '@/payment/billing-query'

/**
 * 管理台核销订单队列与收款账户运营。
 *
 * 权限在 loader 的 server function 里再校验一次：只靠 `beforeLoad` 隐藏入口
 * 拦不住直接调用。列表数据（订单、账户）都来自 Task 6 的 server function，
 * 失败契约是「返回 `Response`」，页面按稳定错误码分支，不自己造码。
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

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/orders')({
  beforeLoad: ({ context }) => {
    // 规格要求三层门禁：collection 模块 → enableAdmin → admin 角色，缺一不可；
    // 模块关闭时整页 404，而不是渲染成 loader 的错误态。
    assertPageEnabled('collection')
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  // 页码与筛选放 URL：刷新与分享链接能停在原处，也符合「URL 即状态」的路由数据流。
  validateSearch: (search: Record<string, unknown>): { page?: number; status?: string } => {
    const parsed = Number(search.page)
    const out: { page?: number; status?: string } = {}
    if (Number.isInteger(parsed) && parsed > 0) out.page = parsed
    if (typeof search.status === 'string' && search.status) out.status = search.status
    return out
  },
  loaderDeps: ({ search }) => ({
    status: typeof search.status === 'string' ? search.status : undefined,
    page: typeof search.page === 'number' ? search.page : 1,
  }),
  loader: async ({ deps }) => {
    // 服务端校验角色；普通用户在这里被 403 挡下，页面渲染不出任何数据。
    const result = await listAdminOrders({
      status: deps.status,
      limit: PAGE_SIZE,
      offset: (deps.page - 1) * PAGE_SIZE,
    })
    const accounts = await fetchCollectionAccountsFn()
    return {
      ok: !(result instanceof Response) && !(accounts instanceof Response),
      page: result instanceof Response ? null : result,
      accounts: accounts instanceof Response ? [] : accounts,
    }
  },
  head: () =>
    seo('/dashboard/admin/orders', {
      title: m['collection_admin.title_orders'](),
      description: m['collection_admin.description_orders'](),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminOrdersComponent,
})

/** 每页条数；服务端 limit 上限 100，这里取常用值。 */
const PAGE_SIZE = 20

/** 调用管理员订单列表的 server function。 */
async function listAdminOrders(query: AdminOrderQuery): Promise<AdminOrderPage | Response> {
  const fn = fetchAdminCollectionOrdersFn as unknown as CallWith<AdminOrderQuery>
  return (await fn({ data: query })) as AdminOrderPage | Response
}

/** 调用管理员核验订单的 server function。 */
async function reviewOrder(payload: AdminReviewPayload): Promise<{ status: string } | Response> {
  const fn = reviewCollectionOrderFn as unknown as CallWith<AdminReviewPayload>
  return (await fn({ data: payload })) as { status: string } | Response
}

/** 调用管理员保存收款账户的 server function。 */
async function saveAccount(payload: AdminAccountPayload): Promise<{ ok: true } | Response> {
  const fn = saveCollectionAccountFn as unknown as CallWith<AdminAccountPayload>
  return (await fn({ data: payload })) as { ok: true } | Response
}

/** 订单状态 → 文案键。文案在渲染期经 `m[key]()` 求值以跟随请求语言。 */
export function collectionAdminOrderStatusMessageKey(status: CollectionOrderStatus) {
  switch (status) {
    case 'pending_payment':
      return 'collection_admin.status_pending_payment'
    case 'pending_verification':
      return 'collection_admin.status_pending_verification'
    case 'settling':
      return 'collection_admin.status_settling'
    case 'settled':
      return 'collection_admin.status_settled'
    case 'expired':
      return 'collection_admin.status_expired'
    case 'canceled':
      return 'collection_admin.status_canceled'
    case 'rejected':
      return 'collection_admin.status_rejected'
    case 'requires_refund':
      return 'collection_admin.status_requires_refund'
    default:
      return 'collection_admin.status_pending_payment'
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

function AdminOrdersComponent() {
  const loaded = Route.useLoaderData()
  const { page: urlPage = 1, status: urlStatus = 'pending_verification' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  const [rows, setRows] = useState<AdminCollectionOrder[] | null>(loaded.page?.rows ?? null)
  const [total, setTotal] = useState(loaded.page?.total ?? 0)
  const [accounts, setAccounts] = useState(loaded.accounts ?? [])
  const [statusFilter, setStatusFilter] = useState(urlStatus)
  const [page, setPage] = useState(urlPage)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reviewTarget, setReviewTarget] = useState<AdminCollectionOrder | null>(null)
  const [form, setForm] = useState<ReviewForm>(EMPTY_FORM)
  const [exceptionConfirm, setExceptionConfirm] = useState(false)

  /**
   * 服务端排序后的数据重新加载。
   *
   * server function 失败时返回 `Response`（不是抛异常），按稳定错误码分支。
   */
  async function load(next: { status: string; page: number }) {
    setBusy(true)
    setError(null)
    const result = await listAdminOrders({
      status: next.status,
      limit: PAGE_SIZE,
      offset: (next.page - 1) * PAGE_SIZE,
    })
    if (result instanceof Response) {
      setBusy(false)
      setError(m['collection_admin.error_generic']())
      return
    }
    setRows(result.rows)
    setTotal(result.total)
    setBusy(false)
  }

  /** 切换筛选：状态进 URL，页码归一。 */
  function changeStatus(value: string) {
    setStatusFilter(value)
    setPage(1)
    void navigate({ search: { status: value, page: undefined } })
    void load({ status: value, page: 1 })
  }

  function changePage(next: number) {
    setPage(next)
    void navigate({ search: { status: statusFilter, page: next } })
    void load({ status: statusFilter, page: next })
  }

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
    if (result instanceof Response) {
      setBusy(false)
      setError(m['collection_admin.error_generic']())
      return
    }
    setBusy(false)
    setReviewTarget(null)
    setForm(EMPTY_FORM)
    toast.add({ type: 'success', title: m['collection_admin.review_done']() })
    void load({ status: statusFilter, page })
  }

  async function toggleAccount(accountId: string, enabled: boolean, displayName: string) {
    setBusy(true)
    setError(null)
    const result = await saveAccount({ accountId, displayName, enabled })
    if (result instanceof Response) {
      setBusy(false)
      setError(m['collection_admin.error_generic']())
      return
    }
    setBusy(false)
    toast.add({
      type: 'success',
      title: enabled
        ? m['collection_admin.account_enabled']()
        : m['collection_admin.account_disabled'](),
    })
    const refreshed = await fetchCollectionAccountsFn()
    if (!(refreshed instanceof Response)) setAccounts(refreshed)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /**
   * 账户区块的展示视图：源码配置与数据库覆盖合并。
   *
   * 数据库只是「覆盖」——账户清单仍在源码配置里。合并规则：
   * - 配置里有、数据库也有 → 用数据库的显示名与二维码，标「数据库覆盖」；
   * - 配置里有、数据库没有 → 用配置兜底，标「源码配置」；
   * - 数据库里有、配置里没有 → 纯覆盖行，标「数据库覆盖」（配置被移除后
   *   它不再参与解析，但管理员仍要能看到并清理它）。
   */
  function accountViews(): AccountView[] {
    const byId = new Map(accounts.map((row) => [row.id, row]))
    const configured = websiteConfig.collection.accounts
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
    for (const row of accounts) {
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
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {m['collection_admin.title_orders']()}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {m['collection_admin.description_orders']()}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* 订单队列 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (value) changeStatus(value)
            }}
            items={statusFilterItems()}
          >
            <SelectTrigger size="sm" aria-label={m['collection_admin.filter_status']()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending_verification">
                {m['collection_admin.status_pending_verification']()}
              </SelectItem>
              <SelectItem value="all">{m['collection_admin.filter_all']()}</SelectItem>
              <SelectItem value="pending_payment">
                {m['collection_admin.status_pending_payment']()}
              </SelectItem>
              <SelectItem value="settling">{m['collection_admin.status_settling']()}</SelectItem>
              <SelectItem value="settled">{m['collection_admin.status_settled']()}</SelectItem>
              <SelectItem value="expired">{m['collection_admin.status_expired']()}</SelectItem>
              <SelectItem value="canceled">{m['collection_admin.status_canceled']()}</SelectItem>
              <SelectItem value="rejected">{m['collection_admin.status_rejected']()}</SelectItem>
              <SelectItem value="requires_refund">
                {m['collection_admin.status_requires_refund']()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!rows || rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m['collection_admin.empty']()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m['collection_admin.col_order_id']()}</TableHead>
                <TableHead>{m['collection_admin.col_buyer']()}</TableHead>
                <TableHead>{m['collection_admin.col_product']()}</TableHead>
                <TableHead>{m['collection_admin.col_amount']()}</TableHead>
                <TableHead>{m['collection_admin.col_submitted_at']()}</TableHead>
                <TableHead>{m['collection_admin.col_note']()}</TableHead>
                <TableHead>{m['collection_admin.col_receipt']()}</TableHead>
                <TableHead>{m['collection_admin.col_status']()}</TableHead>
                <TableHead>{m['collection_admin.col_actions']()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.id}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{order.userEmail}</TableCell>
                  <TableCell>
                    {productNameForProductId(order.productId) ?? order.productId}
                  </TableCell>
                  <TableCell>
                    {formatMoneyAmount(order.payableAmount, order.currency, locale)}
                  </TableCell>
                  <TableCell>{date(order.submittedAt, locale)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{order.payerNote ?? '—'}</TableCell>
                  <TableCell>
                    {order.receiptKey ? (
                      // key 不出现在 URL：凭证只能走服务端端点读取。
                      <img
                        src={`/api/collection/orders/${order.id}/receipt`}
                        alt={m['collection_admin.receipt_alt']()}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m['collection_admin.receipt_missing']()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.status === 'settled' ? 'default' : 'secondary'}>
                      {m[collectionAdminOrderStatusMessageKey(order.status)]()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReviewTarget(order)
                        setForm(EMPTY_FORM)
                      }}
                    >
                      {m['collection_admin.review_open']()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {m.admin_revenue_page_status({ page, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || busy}
                onClick={() => changePage(page - 1)}
              >
                {m.admin_revenue_page_prev()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || busy}
                onClick={() => changePage(page + 1)}
              >
                {m.admin_revenue_page_next()}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 收款账户：源码配置账户与数据库覆盖合并展示。 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">{m['collection_admin.accounts_title']()}</h3>
        {accountViews().length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m['collection_admin.accounts_empty']()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m['collection_admin.col_account_id']()}</TableHead>
                <TableHead>{m['collection_admin.col_account_name']()}</TableHead>
                <TableHead>{m['collection_admin.col_qr']()}</TableHead>
                <TableHead>{m['collection_admin.col_source']()}</TableHead>
                <TableHead>{m['collection_admin.col_actions']()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountViews().map((view) => (
                <TableRow key={view.id}>
                  <TableCell className="font-mono text-xs">{view.id}</TableCell>
                  <TableCell>{view.displayName}</TableCell>
                  <TableCell>
                    {view.qrImageKey ? (
                      // 数据库覆盖的二维码走服务端端点读取。
                      <img
                        src={`/api/collection/accounts/${view.id}/qrcode`}
                        alt={m['collection_admin.qr_alt']()}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : view.configuredQrImageUrl ? (
                      // 源码配置的地址直接引用：它本来就是站内路径或无凭据 HTTPS。
                      <img
                        src={view.configuredQrImageUrl}
                        alt={m['collection_admin.qr_alt']()}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {view.fromDb ? (
                      <Badge variant="secondary">{m['collection_admin.db_override']()}</Badge>
                    ) : (
                      <Badge variant="outline">{m['collection_admin.source_config']()}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void toggleAccount(view.id, !view.enabled, view.displayName)}
                    >
                      {view.enabled
                        ? m['collection_admin.disable']()
                        : m['collection_admin.enable']()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">{m['collection_admin.accounts_note']()}</p>
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
              {m['collection_admin.review_title']({ id: reviewTarget?.id ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {m['collection_admin.review_description']({
                amount: reviewTarget
                  ? formatMoneyAmount(reviewTarget.payableAmount, reviewTarget.currency, locale)
                  : '',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="collection-admin-observed-amount">
                {m['collection_admin.observed_amount']()}
              </Label>
              <Input
                id="collection-admin-observed-amount"
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
              <Label htmlFor="collection-admin-external-reference">
                {m['collection_admin.external_reference']()}
              </Label>
              <Input
                id="collection-admin-external-reference"
                value={form.externalReference}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, externalReference: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection-admin-review-note">
                {m['collection_admin.review_note']()}
              </Label>
              <Input
                id="collection-admin-review-note"
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
              {m['collection_admin.cancel']()}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !noteFilled()}
              onClick={() => void submitReview('reject')}
            >
              {m['collection_admin.reject']()}
            </Button>
            {/* 金额不符时普通通过不可提交：差一分都不能走普通通道。 */}
            <Button
              size="sm"
              disabled={busy || !approveEnabled()}
              onClick={() => void submitReview('approve')}
            >
              {m['collection_admin.approve']()}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !noteFilled()}
              onClick={() => setExceptionConfirm(true)}
            >
              {m['collection_admin.approve_exception']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 异常通过二次确认：明示金额差异与影响。 */}
      <AlertDialog open={exceptionConfirm} onOpenChange={setExceptionConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m['collection_admin.exception_title']()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m['collection_admin.exception_description']({
                observed:
                  reviewTarget && observedAmountCents() !== null
                    ? formatMoneyAmount(observedAmountCents() ?? 0, reviewTarget.currency, locale)
                    : '',
                expected: reviewTarget
                  ? formatMoneyAmount(reviewTarget.payableAmount, reviewTarget.currency, locale)
                  : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m['collection_admin.cancel']()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExceptionConfirm(false)
                void submitReview('approve_exception')
              }}
            >
              {m['collection_admin.confirm']()}
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
    { value: 'pending_payment', label: m['collection_admin.status_pending_payment']() },
    {
      value: 'pending_verification',
      label: m['collection_admin.status_pending_verification'](),
    },
    { value: 'settling', label: m['collection_admin.status_settling']() },
    { value: 'settled', label: m['collection_admin.status_settled']() },
    { value: 'expired', label: m['collection_admin.status_expired']() },
    { value: 'canceled', label: m['collection_admin.status_canceled']() },
    { value: 'rejected', label: m['collection_admin.status_rejected']() },
    { value: 'requires_refund', label: m['collection_admin.status_requires_refund']() },
    { value: 'all', label: m['collection_admin.filter_all']() },
  ]
}

function date(value: Date | string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleDateString(locale) : '—'
}
