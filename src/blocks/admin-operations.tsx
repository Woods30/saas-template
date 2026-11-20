import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CircleHelp,
  RefreshCw,
} from 'lucide-react';

import { matchPermission } from '@/core/auth/rbac';
import { Link } from '@/core/i18n/navigation';
import { apiGet } from '@/lib/api-client';
import { formatOperationsMoney, type OperationsReport } from '@/lib/operations';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { OperationsExperiments } from './admin-operations-experiments';

const rate = (part: number, base: number) =>
  base ? `${((part / base) * 100).toFixed(1)}%` : '—';
const moneyList = (rows: { currency: string; amount: number }[]) =>
  rows.length
    ? rows
        .map((r) => formatOperationsMoney(r.amount, r.currency, getLocale()))
        .join(' · ')
    : '—';
function exportReport(report: OperationsReport) {
  const rows = [
    [
      'group',
      'visitors',
      'signups',
      'active',
      'plan_selected',
      'checkouts',
      'paid',
      'visitor_signup_rate',
      'signup_paid_rate',
      'revenue',
    ],
    ...report.rows.map((r) => [
      r.value || '(direct / unknown)',
      r.visitors,
      r.signups,
      r.active,
      r.selected,
      r.checkouts,
      r.paid,
      rate(r.signups, r.visitors),
      rate(r.paid, r.signups),
      moneyList(r.revenue),
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${String(value)
              .replace(/^[=+\-@\t\r]/, "'$&")
              .replaceAll('"', '""')}"`
        )
        .join(',')
    )
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `operations-${report.generatedAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminOperations() {
  const permissions = useUserPermissions();
  const canRead = matchPermission(
    'admin.operations.read',
    permissions.data?.permissions ?? []
  );
  const canWrite = matchPermission(
    'admin.operations.write',
    permissions.data?.permissions ?? []
  );
  const [days, setDays] = useState(7);
  const [groupBy, setGroupBy] = useState<
    'source' | 'country' | 'buildId' | 'entryPath'
  >('source');
  const [tab, setTab] = useState<'funnel' | 'daily' | 'experiments'>('funnel');
  const query = useQuery({
    queryKey: ['admin-operations', days, groupBy],
    queryFn: () =>
      apiGet<OperationsReport>(
        `/api/admin/operations?days=${days}&groupBy=${groupBy}`
      ),
    enabled: canRead,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const report = query.data;
  if (permissions.isPending)
    return (
      <p className="p-6" role="status">
        {m['admin.operations.loading']()}
      </p>
    );
  if (!canRead)
    return (
      <p className="text-muted-foreground p-6">
        {m['admin.operations.forbidden']()}
      </p>
    );
  const dimensionLabels = {
    source: m['admin.operations.source'](),
    country: m['admin.operations.country'](),
    buildId: m['admin.operations.build'](),
    entryPath: m['admin.operations.entry'](),
  };
  const steps = [
    { key: 'visitors', label: m['admin.operations.visitors']() },
    { key: 'signups', label: m['admin.operations.signups']() },
    { key: 'selected', label: m['admin.operations.selected']() },
    { key: 'checkouts', label: m['admin.operations.checkouts']() },
    { key: 'paid', label: m['admin.operations.paid']() },
  ] as const;
  const totals = report?.totals;
  const successful = report?.ai.success ?? 0;
  const finished = successful + (report?.ai.failed ?? 0);
  const periodText = report
    ? `${new Date(report.today.from).toLocaleTimeString(getLocale(), { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}–${new Date(report.today.to).toLocaleTimeString(getLocale(), { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}`
    : '—';
  const revenueComparison = report?.today.revenue
    .map((r) => {
      const previous =
        report.yesterday.revenue.find((p) => p.currency === r.currency)
          ?.amount ?? 0;
      return `${r.currency.toUpperCase()} ${previous ? `${(((r.amount - previous) / Math.abs(previous)) * 100).toFixed(1)}%` : m['admin.operations.no_baseline']()}`;
    })
    .join(' · ');
  return (
    <div className="mx-auto max-w-[1600px] space-y-7 p-4 md:p-7">
      <header className="border-border flex flex-wrap items-start justify-between gap-5 border-b pb-6">
        <div>
          <div className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-medium tracking-widest uppercase">
            <Activity className="size-3.5" />
            {m['admin.operations.eyebrow']()}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {m['admin.operations.title']()}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
            {m['admin.operations.description']()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!report || query.isPlaceholderData}
            onClick={() => report && exportReport(report)}
          >
            <ArrowDownToLine className="size-4" />
            {m['admin.operations.export']()}
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw
              className={cn('size-4', query.isFetching && 'animate-spin')}
            />
            {m['admin.operations.refresh']()}
          </Button>
        </div>
      </header>
      {query.isError && (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm"
          role="alert"
        >
          {m['admin.operations.load_error']()} {query.error.message}
          <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
            {m['admin.operations.retry']()}
          </Button>
        </div>
      )}
      {!report && query.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          role="status"
          aria-label={m['admin.operations.loading']()}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="bg-muted h-36 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        report && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-muted-foreground">
                {m['admin.operations.same_time']()} · {periodText} · UTC+08:00
              </p>
              <span className="text-muted-foreground">
                {m['admin.operations.updated']()}{' '}
                {new Date(report.generatedAt).toLocaleTimeString(getLocale(), {
                  timeZone: 'Asia/Shanghai',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {m['admin.operations.auto_refresh']()}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="bg-primary text-primary-foreground rounded-xl p-5">
                <p className="text-sm opacity-80">
                  {m['admin.operations.today_revenue']()}
                </p>
                <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">
                  {moneyList(report.today.revenue)}
                </p>
                <p className="mt-3 text-xs opacity-80">
                  {m['admin.operations.yesterday']()}{' '}
                  {moneyList(report.yesterday.revenue)}
                </p>
                {revenueComparison && (
                  <p className="mt-1 text-xs opacity-80">{revenueComparison}</p>
                )}
              </div>
              {[
                {
                  label: m['admin.operations.today_payers'](),
                  value: report.today.payers.toLocaleString(),
                  hint: m['admin.operations.payers_hint']({
                    orders: report.today.orders,
                    previous: report.yesterday.payers,
                  }),
                },
                {
                  label: m['admin.operations.unpaid'](),
                  value: report.unpaid24h.toLocaleString(),
                  hint: m['admin.operations.unpaid_hint'](),
                },
                {
                  label: m['admin.operations.ai_success'](),
                  value: rate(successful, finished),
                  hint: m['admin.operations.ai_hint']({
                    success: successful,
                    failed: report.ai.failed,
                    pending: report.ai.pending,
                  }),
                },
                {
                  label: m['admin.operations.tickets'](),
                  value: report.openTickets.toLocaleString(),
                  hint: m['admin.operations.tickets_hint'](),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="border-border bg-card rounded-xl border p-5"
                >
                  <p className="text-muted-foreground text-sm">{item.label}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
                    {item.value}
                  </p>
                  <p className="text-muted-foreground mt-3 text-xs leading-5">
                    {item.hint}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-border bg-muted/25 grid gap-4 rounded-xl border p-4 text-sm md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">
                  {m['admin.operations.last_payment']()}{' '}
                </span>
                {report.lastPaidAt
                  ? new Date(report.lastPaidAt).toLocaleString(getLocale(), {
                      timeZone: 'Asia/Shanghai',
                    })
                  : m['admin.operations.no_payments']()}
              </div>
              <div className="text-muted-foreground md:text-right">
                {m['admin.operations.provider_balance']()}
              </div>
              {report.ai.failed > 0 && (
                <p role="status" className="text-destructive md:col-span-2">
                  {m['admin.operations.failure_alert']({
                    count: report.ai.failed,
                  })}
                </p>
              )}
            </div>
          </>
        )
      )}
      <div className="border-border flex flex-wrap items-end justify-between gap-4 border-b">
        <div
          className="flex gap-5"
          role="tablist"
          aria-label={m['admin.operations.views']()}
        >
          {(
            [
              { value: 'funnel', label: m['admin.operations.funnel']() },
              { value: 'daily', label: m['admin.operations.daily']() },
              {
                value: 'experiments',
                label: m['admin.operations.experiments'](),
              },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.value}
              role="tab"
              aria-selected={tab === item.value}
              aria-controls="operations-panel"
              id={`operations-tab-${item.value}`}
              tabIndex={tab === item.value ? 0 : -1}
              onKeyDown={(e) => {
                const tabs = ['funnel', 'daily', 'experiments'] as const;
                const next =
                  e.key === 'ArrowRight'
                    ? (tabs.indexOf(tab) + 1) % 3
                    : e.key === 'ArrowLeft'
                      ? (tabs.indexOf(tab) + 2) % 3
                      : -1;
                if (next >= 0) {
                  e.preventDefault();
                  setTab(tabs[next]);
                  document
                    .getElementById(`operations-tab-${tabs[next]}`)
                    ?.focus();
                }
              }}
              onClick={() => setTab(item.value)}
              className={cn(
                'border-b-2 px-1 pb-3 text-sm transition-colors',
                tab === item.value
                  ? 'border-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab !== 'experiments' && (
          <label className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {m['admin.operations.period']()}
            </span>
            <select
              className="border-input bg-background h-9 rounded-md border px-2"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>{m['admin.operations.days7']()}</option>
              <option value={30}>{m['admin.operations.days30']()}</option>
            </select>
          </label>
        )}
      </div>
      <div
        role="tabpanel"
        id="operations-panel"
        aria-labelledby={`operations-tab-${tab}`}
        aria-busy={query.isFetching && tab !== 'experiments'}
        className={cn('space-y-6', query.isPlaceholderData && 'opacity-60')}
      >
        {tab === 'funnel' && (
          <>
            <section
              className="grid gap-3 sm:grid-cols-5"
              aria-label={m['admin.operations.funnel']()}
            >
              {steps.map((step, i) => (
                <div className="bg-muted/30 rounded-lg p-4" key={step.key}>
                  <p className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>
                      0{i + 1} / {step.label}
                    </span>
                    {i < 4 && <ArrowUpRight className="size-3" />}
                  </p>
                  <p className="my-3 text-2xl font-semibold tabular-nums">
                    {totals ? totals[step.key].toLocaleString() : '—'}
                  </p>
                  <div className="bg-muted h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{
                        width: `${totals?.visitors ? Math.min(100, (totals[step.key] / totals.visitors) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {m['admin.operations.breakdown']()}
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  {m['admin.operations.tracking_since']()}{' '}
                  {report?.trackingSince
                    ? new Date(report.trackingSince).toLocaleString(
                        getLocale(),
                        { timeZone: 'Asia/Shanghai' }
                      )
                    : m['admin.operations.awaiting_visitors']()}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {m['admin.operations.group_by']()}
                </span>
                <select
                  className="border-input bg-background h-9 rounded-md border px-3"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                >
                  {Object.entries(dimensionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="border-border overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimensionLabels[groupBy]}</TableHead>
                    {[
                      m['admin.operations.visitors'](),
                      m['admin.operations.signups'](),
                      m['admin.operations.active'](),
                      m['admin.operations.checkouts'](),
                      m['admin.operations.paid'](),
                      m['admin.operations.signup_rate'](),
                      m['admin.operations.paid_rate'](),
                      m['admin.operations.revenue'](),
                    ].map((label) => (
                      <TableHead className="text-right" key={label}>
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!report?.rows.length ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-muted-foreground h-32 text-center"
                      >
                        {query.isPending
                          ? m['admin.operations.loading']()
                          : m['admin.operations.empty']()}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.rows.map((row) => (
                      <TableRow key={row.value}>
                        <TableCell
                          className={cn(
                            'max-w-64 truncate font-medium',
                            groupBy === 'buildId' && 'font-mono text-xs'
                          )}
                          title={row.value}
                        >
                          {row.value || m['admin.operations.direct_unknown']()}
                        </TableCell>
                        {(
                          [
                            row.visitors,
                            row.signups,
                            row.active,
                            row.checkouts,
                            row.paid,
                          ] as const
                        ).map((value, i) => (
                          <TableCell
                            key={i}
                            className="text-right tabular-nums"
                          >
                            {value.toLocaleString()}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">
                          {rate(row.signups, row.visitors)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {rate(row.paid, row.signups)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {moneyList(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground text-xs leading-6">
              {m['admin.operations.cohort_hint']()}
            </p>
          </>
        )}
        {tab === 'daily' && (
          <>
            <div>
              <h2 className="text-lg font-semibold">
                {m['admin.operations.daily']()}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {m['admin.operations.daily_hint']()}
              </p>
            </div>
            <div className="border-border overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      m['admin.operations.date'](),
                      m['admin.operations.signups'](),
                      m['admin.operations.paid'](),
                      m['admin.operations.orders'](),
                      m['admin.operations.revenue'](),
                    ].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.days.map((day) => (
                    <TableRow key={day.day}>
                      <TableCell className="font-mono text-xs">
                        {day.day}
                      </TableCell>
                      <TableCell>{day.signups.toLocaleString()}</TableCell>
                      <TableCell>{day.payers.toLocaleString()}</TableCell>
                      <TableCell>{day.orders.toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {moneyList(day.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {tab === 'experiments' && (
          <OperationsExperiments
            canWrite={canWrite}
            buildId={report?.buildId ?? ''}
          />
        )}
      </div>
      <details className="border-border bg-muted/20 rounded-xl border p-5">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <CircleHelp className="size-4" />
          {m['admin.operations.method']()}
        </summary>
        <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-7">
          <p>{m['admin.operations.method_source']()}</p>
          <p>{m['admin.operations.method_metrics']()}</p>
          <p>{m['admin.operations.method_experiments']()}</p>
          <p>{m['admin.operations.method_tracking']()}</p>
          <Link
            href="/admin/users"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {m['admin.operations.user_timeline']()}
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </details>
    </div>
  );
}
