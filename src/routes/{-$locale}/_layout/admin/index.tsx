import { IconChartBar, IconRepeat, IconScan, IconUsers } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adminRoutes } from '@/config/routes'
import { formatMoney } from '@/lib/format'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import {
  FUNNEL_DIMENSIONS,
  FUNNEL_RANGES,
  type FunnelDimension,
  type FunnelRange,
  fetchAdminOverview,
} from '@/modules/subscriptions/service'
import { ConversionFunnel } from './-conversion-funnel'
import { paymentColumns } from './-payment-columns'

/**
 * 管理台概览。
 *
 * 首屏回答四件事：规模（用户）、收入（30 天营收）、留存（活跃订阅）与待办
 * （待核销）。漏斗与最近付款放在下面，漏斗范围 / 维度写进 URL，刷新与分享
 * 都能停在同一个视图上。数据在 loader 里取，权限由 server function 再校验。
 */
const RANGE_VALUES = Object.keys(FUNNEL_RANGES) as FunnelRange[]

interface AdminOverviewSearch {
  range?: FunnelRange
  groupBy?: FunnelDimension
}

export const Route = createFileRoute('/{-$locale}/_layout/admin/')({
  // 返回的每个键都必须存在（值为 `undefined` 时 Router 会省略）；默认值不写进 URL。
  validateSearch: (search: Record<string, unknown>): AdminOverviewSearch => {
    const rawRange = search.range
    const range =
      typeof rawRange === 'string' &&
      rawRange !== '30d' &&
      (RANGE_VALUES as readonly string[]).includes(rawRange)
        ? (rawRange as FunnelRange)
        : undefined
    const rawGroupBy = search.groupBy
    const groupBy =
      typeof rawGroupBy === 'string' &&
      rawGroupBy !== 'utm_source' &&
      (FUNNEL_DIMENSIONS as readonly string[]).includes(rawGroupBy)
        ? (rawGroupBy as FunnelDimension)
        : undefined
    return { range, groupBy }
  },
  loaderDeps: ({ search }) => ({
    range: search.range ?? '30d',
    groupBy: search.groupBy ?? 'utm_source',
  }),
  loader: ({ deps }) => fetchAdminOverview({ data: deps }),
  head: () => adminHead(adminRoutes.overview),
  component: AdminOverviewPage,
})

/** 金额以最小货币单位存储（分），展示前按币种小数位换算。 */
function money(amount: number, currency: string): string {
  return formatMoney(amount, currency, getRequestLocale())
}

function AdminOverviewPage() {
  const data = Route.useLoaderData()
  const { range = '30d', groupBy = 'utm_source' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()
  const { users, revenue30d, todos } = data

  const kpiCards = [
    {
      title: m.admin_overview_total_users(),
      icon: IconUsers,
      value: String(users.total),
      hint: `+${users.new24h} ${m.admin_overview_new_users_24h()}`,
    },
    {
      title: m.admin_overview_revenue_30d(),
      icon: IconChartBar,
      value: money(revenue30d.amount, revenue30d.currency),
      hint: revenue30d.currency.toUpperCase(),
    },
    {
      title: m.admin_revenue_active_subscriptions(),
      icon: IconRepeat,
      value: String(data.activeSubscriptions),
      hint: '',
    },
    {
      title: m.admin_overview_pending_reviews(),
      icon: IconScan,
      value: String(data.pendingManualReviews),
      hint: m.admin_overview_pending_reviews_hint(),
    },
  ]

  const todoItems = [
    { label: m.admin_overview_todo_pending_reviews(), value: todos.pendingManualReviews },
    { label: m.admin_overview_todo_open_tickets(), value: todos.openTickets },
    { label: m.admin_overview_todo_failed_payments(), value: todos.failedPayments24h },
  ]

  // 列定义随语言变化；`m.*()` 在渲染期求值，因此依赖里带上 locale。
  // 与付款列表共用同一份定义，只开启共有列。
  const columns = useMemo(() => paymentColumns({ locale }), [locale])

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{card.value}</div>
              {card.hint ? <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <ConversionFunnel
        report={data.funnel}
        range={range}
        groupBy={groupBy}
        onRangeChange={(next) =>
          void navigate({
            search: (previous) => ({ ...previous, range: next === '30d' ? undefined : next }),
          })
        }
        onGroupByChange={(next) =>
          void navigate({
            search: (previous) => ({
              ...previous,
              groupBy: next === 'utm_source' ? undefined : next,
            }),
          })
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <h3 className="text-lg font-semibold">{m.admin_overview_recent_payments()}</h3>
          <DataTable
            columns={columns}
            data={data.recentPayments}
            rowKey={(payment) => payment.id}
            emptyTitle={m.admin_payments_empty()}
          />
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{m.admin_overview_todos()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todoItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-lg font-semibold tabular-nums">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
