import { IconCoins, IconHistory, IconMinus, IconPlus } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { LocalDateTime } from '@/components/local-date'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminCreditBalance,
  type AdminCreditTransactionRow,
  deductAdminCredits,
  fetchAdminCredits,
  fetchAdminCreditTransactions,
  grantAdminCredits,
} from '@/modules/credits/service'

/**
 * 管理台积分页。
 *
 * 余额是账本的物化视图，流水是账本的事实源。这里只读账本，
 * 手工调整一律走账本自己的发放 / 消费接口——另写一套改余额的 SQL 会绕开
 * 幂等闸与 FIFO 批次逻辑。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/credits')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  // 属性声明为可选：`MakeRequiredSearchParams` 会把「必填的 search 参数」算进
  // 链接类型，导致侧栏里的 linkOptions 必须带 search，导航项就没法只写路径。
  validateSearch: (search: Record<string, unknown>): AdminCreditsSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
    const keyword = typeof search.q === 'string' ? search.q : ''
    return { page, q: keyword }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, q: search.q ?? '' }),
  loader: ({ deps }) =>
    fetchAdminCredits({
      data: {
        search: deps.q || undefined,
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      },
    }),
  head: () =>
    seo('/dashboard/admin/credits', {
      title: m.admin_credits_title(),
      description: m.admin_credits_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminCreditsPage,
})

/** 每页余额条数。 */
const PAGE_SIZE = 20

/** 搜索防抖：每次按键都打接口既慢又会打乱分页。 */
const SEARCH_DEBOUNCE_MS = 300

interface AdminCreditsSearch {
  page?: number
  q?: string
}

/** 流水类型的展示文案。 */
function transactionTypeLabel(type: string): string {
  switch (type) {
    case 'grant':
      return m.admin_credits_transaction_type_grant()
    case 'consume':
      return m.admin_credits_transaction_type_consume()
    case 'refund':
      return m.admin_credits_transaction_type_refund()
    case 'expire':
      return m.admin_credits_transaction_type_expire()
    case 'adjust':
      return m.admin_credits_transaction_type_adjust()
    default:
      return type
  }
}

function AdminCreditsPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const { page = 1, q = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  const [keyword, setKeyword] = useState(q)
  const [adjustTarget, setAdjustTarget] = useState<{
    balance: AdminCreditBalance
    mode: 'grant' | 'deduct'
  } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<AdminCreditBalance | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 关键词变化后重置页码：第 3 页的搜索结果换关键词后往往不存在了。
  useEffect(() => {
    if (keyword === q) return
    const timer = setTimeout(() => {
      void navigate({ search: (previous) => ({ ...previous, q: keyword, page: 1 }) })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword, q, navigate])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  /**
   * 调整成功后重新拉列表：余额是物化视图，页面上那份不会自己变。
   *
   * 用 `invalidate()` 而不是「导航到同一个 search」——后者在地址没变时是空操作，
   * loader 不会重跑，页面上的余额仍是旧的。
   */
  const reload = useCallback(async () => {
    await router.invalidate()
  }, [router])

  async function runAdjust(amount: number, note: string) {
    if (!adjustTarget) return
    setBusy(true)
    setError(null)
    try {
      if (adjustTarget.mode === 'grant') {
        await grantAdminCredits({
          data: { userId: adjustTarget.balance.userId, amount, note: note || undefined },
        })
        toast.add({ type: 'success', title: m.admin_credits_granted_toast() })
      } else {
        await deductAdminCredits({
          data: { userId: adjustTarget.balance.userId, amount, note: note || undefined },
        })
        toast.add({ type: 'success', title: m.admin_credits_deducted_toast() })
      }
      setAdjustTarget(null)
      await reload()
    } catch (adjustError) {
      // 积分不足等业务错误：把服务端给的消息显示出来，别只说「失败」。
      const message = adjustError instanceof Error ? adjustError.message.split('\n')[0] : undefined
      setError(message || m.settings_error_generic())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{m.admin_credits_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.admin_credits_description()}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={m.admin_credits_search_placeholder()}
          aria-label={m.admin_credits_search_placeholder()}
          className="min-w-48 max-w-sm flex-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {data.balances.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconCoins aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{m.admin_credits_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.admin_credits_col_user()}</TableHead>
              <TableHead>{m.admin_credits_col_balance()}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {m.admin_credits_col_granted()}
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                {m.admin_credits_col_consumed()}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {m.admin_credits_col_refunded()}
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                {m.admin_credits_col_updated_at()}
              </TableHead>
              <TableHead className="text-right">{m.admin_users_col_actions()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.balances.map((balance: AdminCreditBalance) => (
              <TableRow key={balance.userId}>
                <TableCell className="max-w-[220px] truncate">
                  {balance.email || balance.userId}
                </TableCell>
                <TableCell className="font-medium">{balance.balance}</TableCell>
                <TableCell className="hidden sm:table-cell">{balance.totalGranted}</TableCell>
                <TableCell className="hidden sm:table-cell">{balance.totalConsumed}</TableCell>
                <TableCell className="hidden lg:table-cell">{balance.totalRefunded}</TableCell>
                <TableCell className="hidden xl:table-cell">
                  <LocalDateTime value={balance.updatedAt} locale={locale} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustTarget({ balance, mode: 'grant' })}
                    >
                      <IconPlus data-icon="inline-start" aria-hidden />
                      {m.admin_credits_grant()}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={balance.balance <= 0}
                      onClick={() => setAdjustTarget({ balance, mode: 'deduct' })}
                    >
                      <IconMinus data-icon="inline-start" aria-hidden />
                      {m.admin_credits_deduct()}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryTarget(balance)}
                    >
                      <IconHistory data-icon="inline-start" aria-hidden />
                      {m.admin_credits_transactions_title()}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data.total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {m.admin_credits_page_status({ page: currentPage, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: currentPage - 1 }),
                })
              }
            >
              {m.admin_credits_page_prev()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: currentPage + 1 }),
                })
              }
            >
              {m.admin_credits_page_next()}
            </Button>
          </div>
        </div>
      )}

      <AdjustDialog
        target={adjustTarget}
        busy={busy}
        onClose={() => setAdjustTarget(null)}
        onSubmit={runAdjust}
      />

      <TransactionsDialog target={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  )
}

/** 发放 / 扣减弹窗。表单状态独立，关掉再开应回到空白。 */
function AdjustDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: { balance: AdminCreditBalance; mode: 'grant' | 'deduct' } | null
  busy: boolean
  onClose: () => void
  onSubmit: (amount: number, note: string) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const parsed = Number.parseInt(amount, 10)
  const safeAmount = Number.isInteger(parsed) && parsed > 0 ? parsed : 0
  const isGrant = target?.mode === 'grant'

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAmount('')
          setNote('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isGrant ? m.admin_credits_grant_title() : m.admin_credits_deduct_title()}
          </DialogTitle>
          <DialogDescription>{target?.balance.email || target?.balance.userId}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credit-amount">{m.admin_credits_amount_label()}</Label>
            <Input
              id="credit-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{m.admin_credits_amount_hint()}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-note">{m.admin_credits_note_label()}</Label>
            <Input
              id="credit-note"
              value={note}
              placeholder={m.admin_credits_note_placeholder()}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {m.admin_users_cancel()}
          </DialogClose>
          <Button
            type="button"
            disabled={busy || safeAmount <= 0}
            onClick={() => void onSubmit(safeAmount, note.trim())}
          >
            {isGrant ? m.admin_credits_grant_submit() : m.admin_credits_deduct_submit()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 某个用户的积分流水弹窗。 */
function TransactionsDialog({
  target,
  onClose,
}: {
  target: AdminCreditBalance | null
  onClose: () => void
}) {
  const [rows, setRows] = useState<AdminCreditTransactionRow[] | null>(null)
  const locale = getRequestLocale()

  const load = useCallback(async (userId: string) => {
    const result = await fetchAdminCreditTransactions({ data: { userId, limit: 50 } })
    setRows(result.transactions)
  }, [])

  useEffect(() => {
    if (!target) {
      setRows(null)
      return
    }
    void load(target.userId)
  }, [target, load])

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{m.admin_credits_transactions_title()}</DialogTitle>
          <DialogDescription>{target?.email || target?.userId}</DialogDescription>
        </DialogHeader>
        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m.admin_credits_transactions_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.admin_credits_transaction_col_type()}</TableHead>
                <TableHead>{m.admin_credits_transaction_col_amount()}</TableHead>
                <TableHead>{m.admin_credits_balance_after()}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {m.admin_credits_transaction_col_reference()}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {m.admin_credits_transaction_col_created_at()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{transactionTypeLabel(row.type)}</TableCell>
                  <TableCell className={row.amount < 0 ? 'text-destructive' : undefined}>
                    {row.amount > 0 ? `+${row.amount}` : row.amount}
                  </TableCell>
                  <TableCell>{row.balanceAfter}</TableCell>
                  <TableCell className="hidden max-w-[200px] truncate sm:table-cell">
                    {row.reference ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <LocalDateTime value={row.createdAt} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {m.admin_users_cancel()}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
