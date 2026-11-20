import type { DataTableColumn } from '@/components/data-table/data-table'
import { LocalDate } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/format'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminOrder,
  paymentStatusMessageKey,
  productNameForProductId,
} from '@/modules/subscriptions/service'

/**
 * 付款明细的共享列定义。
 *
 * 概览的「最近付款」与付款列表展示同一形状的 `AdminOrder`，列定义只维护一份：
 * 各页按需打开「已退款」/「创建时间」列，列顺序在两页保持一致。
 *
 * 文件名以 `-` 开头：TanStack Router 不把它当作路由文件。
 */
export interface PaymentColumnOptions {
  locale: string
  /** 追加「已退款」列。 */
  refunded?: boolean
  /** 追加「创建时间」列。 */
  createdAt?: boolean
}

/** 按固定顺序拼出列定义；文案在渲染期由 `m.*()` 求值。 */
export function paymentColumns(options: PaymentColumnOptions): DataTableColumn<AdminOrder>[] {
  const columns: DataTableColumn<AdminOrder>[] = [
    {
      id: 'user',
      header: m.admin_payments_col_user(),
      className: 'max-w-[220px] truncate',
      cell: (payment) => payment.email || payment.userId || '—',
    },
    {
      id: 'product',
      header: m.admin_payments_col_product(),
      cell: (payment) => productNameForProductId(payment.productId) ?? payment.productId ?? '—',
    },
    {
      id: 'amount',
      header: m.admin_payments_col_amount(),
      cell: (payment) => formatMoney(payment.amount, payment.currency, options.locale),
    },
  ]

  if (options.refunded) {
    columns.push({
      id: 'refunded',
      header: m.admin_payments_col_refunded(),
      cell: (payment) =>
        payment.refundedAmount > 0
          ? formatMoney(payment.refundedAmount, payment.currency, options.locale)
          : '—',
    })
  }

  columns.push(
    {
      id: 'status',
      header: m.admin_payments_col_status(),
      cell: (payment) => (
        <Badge variant={payment.status === 'paid' ? 'default' : 'secondary'}>
          {m[paymentStatusMessageKey(payment.status)]()}
        </Badge>
      ),
    },
    {
      id: 'paidAt',
      header: m.admin_payments_col_paid_at(),
      className: 'hidden lg:table-cell',
      cell: (payment) => <LocalDate value={payment.paidAt} locale={options.locale} />,
    },
  )

  if (options.createdAt) {
    columns.push({
      id: 'createdAt',
      header: m.admin_payments_col_created_at(),
      className: 'hidden xl:table-cell',
      cell: (payment) => <LocalDate value={payment.createdAt} locale={options.locale} />,
    })
  }

  return columns
}
