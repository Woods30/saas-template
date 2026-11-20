import { IconCoins, IconHistory, IconMinus, IconPlus } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { adminRoutes } from '@/config/routes'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
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
export const Route = createFileRoute('/{-$locale}/_layout/admin/credits')({
  // 属性声明为可选：`MakeRequiredSearchParams` 会把「必填的 search 参数」算进
  // 链接类型，导致侧栏里的 linkOptions 必须带 search，导航项就没法只写路径。
  validateSearch: (search: Record<string, unknown>): AdminCreditsSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
    const keyword = typeof search.q === 'string' && search.q ? search.q : undefined
    return { page, q: keyword }
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, q: search.q ?? '' }),
  loader: ({ deps }) =>
    fetchAdminCredits({
      data: {
        search: deps.q || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.credits),
  component: AdminCreditsPage,
})

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

  const debouncedKeyword = useDebouncedValue(keyword)

  // URL 是搜索词的事实来源：前进 / 后退时输入框要跟着回到对应关键词。
  useEffect(() => {
    setKeyword(q)
  }, [q])

  // 关键词变化后重置页码：第 3 页的搜索结果换关键词后往往不存在了。
  useEffect(() => {
    if (debouncedKeyword === q) return
    void navigate({
      search: (previous) => ({ ...previous, q: debouncedKeyword || undefined, page: undefined }),
      replace: true,
    })
  }, [debouncedKeyword, q, navigate])

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

  const columns = useMemo<DataTableColumn<AdminCreditBalance>[]>(
    () => [
      {
        id: 'user',
        header: m.admin_credits_col_user(),
        className: 'max-w-[220px] truncate',
        cell: (balance) => balance.email || balance.userId,
      },
      {
        id: 'balance',
        header: m.admin_credits_col_balance(),
        className: 'font-medium',
        cell: (balance) => balance.balance,
      },
      {
        id: 'granted',
        header: m.admin_credits_col_granted(),
        className: 'hidden sm:table-cell',
        cell: (balance) => balance.totalGranted,
      },
      {
        id: 'consumed',
        header: m.admin_credits_col_consumed(),
        className: 'hidden sm:table-cell',
        cell: (balance) => balance.totalConsumed,
      },
      {
        id: 'refunded',
        header: m.admin_credits_col_refunded(),
        className: 'hidden lg:table-cell',
        cell: (balance) => balance.totalRefunded,
      },
      {
        id: 'updatedAt',
        header: m.admin_credits_col_updated_at(),
        className: 'hidden xl:table-cell',
        cell: (balance) => <LocalDateTime value={balance.updatedAt} locale={locale} />,
      },
      {
        id: 'actions',
        header: m.admin_users_col_actions(),
        className: 'text-right',
        cell: (balance) => (
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
        ),
      },
    ],
    [locale],
  )

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={data.balances}
        rowKey={(balance) => balance.userId}
        error={error}
        emptyIcon={<IconCoins aria-hidden />}
        emptyTitle={m.admin_credits_empty()}
        pagination={{
          page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: data.total,
          onPageChange: (next) =>
            void navigate({
              search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }),
            }),
        }}
        toolbar={
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={m.admin_credits_search_placeholder()}
            aria-label={m.admin_credits_search_placeholder()}
            className="min-w-48 max-w-sm flex-1"
          />
        }
      />

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

  const columns = useMemo<DataTableColumn<AdminCreditTransactionRow>[]>(
    () => [
      {
        id: 'type',
        header: m.admin_credits_transaction_col_type(),
        cell: (row) => transactionTypeLabel(row.type),
      },
      {
        id: 'amount',
        header: m.admin_credits_transaction_col_amount(),
        cell: (row) => (
          <span className={row.amount < 0 ? 'text-destructive' : undefined}>
            {row.amount > 0 ? `+${row.amount}` : row.amount}
          </span>
        ),
      },
      {
        id: 'balanceAfter',
        header: m.admin_credits_balance_after(),
        cell: (row) => row.balanceAfter,
      },
      {
        id: 'reference',
        header: m.admin_credits_transaction_col_reference(),
        className: 'hidden max-w-[200px] truncate sm:table-cell',
        cell: (row) => row.reference ?? '—',
      },
      {
        id: 'createdAt',
        header: m.admin_credits_transaction_col_created_at(),
        className: 'hidden lg:table-cell',
        cell: (row) => <LocalDateTime value={row.createdAt} locale={locale} />,
      },
    ],
    [locale],
  )

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{m.admin_credits_transactions_title()}</DialogTitle>
          <DialogDescription>{target?.email || target?.userId}</DialogDescription>
        </DialogHeader>
        <DataTable
          columns={columns}
          data={rows ?? []}
          rowKey={(row) => row.id}
          loading={rows === null}
          emptyTitle={m.admin_credits_transactions_empty()}
        />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {m.admin_users_cancel()}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
