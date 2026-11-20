import { IconClipboardList } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminRoutes } from '@/config/routes'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import { type AuditLogItem, fetchAdminAuditLogs } from '@/modules/audit/service'

interface AdminAuditSearch {
  page?: number
  q?: string
  target?: string
}

export const Route = createFileRoute('/{-$locale}/_layout/admin/audit')({
  validateSearch: (search: Record<string, unknown>): AdminAuditSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
    const q = typeof search.q === 'string' && search.q ? search.q : undefined
    const target = typeof search.target === 'string' && search.target ? search.target : undefined
    return { page, q, target }
  },
  loaderDeps: ({ search }) => ({
    page: search.page ?? 1,
    q: search.q ?? '',
    target: search.target ?? '',
  }),
  loader: ({ deps }) =>
    fetchAdminAuditLogs({
      data: {
        search: deps.q || undefined,
        targetType: deps.target || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.audit),
  component: AdminAuditPage,
})

function AdminAuditPage() {
  const data = Route.useLoaderData()
  const { page = 1, q = '', target = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  const [keyword, setKeyword] = useState(q)
  const debouncedKeyword = useDebouncedValue(keyword)

  // URL 是搜索词的事实来源：外部改动（首页跳转、清空筛选）要回写到输入框。
  useEffect(() => {
    setKeyword(q)
  }, [q])

  useEffect(() => {
    if (debouncedKeyword === q) return
    void navigate({
      search: (prev) => ({ ...prev, q: debouncedKeyword || undefined, page: undefined }),
      replace: true,
    })
  }, [debouncedKeyword, q, navigate])

  const columns = useMemo<DataTableColumn<AuditLogItem>[]>(
    () => [
      {
        id: 'createdAt',
        header: m.admin_audit_col_created_at(),
        className: 'whitespace-nowrap text-xs text-muted-foreground',
        cell: (log) => <LocalDateTime value={log.createdAt} locale={locale} />,
      },
      {
        id: 'actor',
        header: m.admin_audit_col_actor(),
        cell: (log) => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{log.actorEmail ?? m.admin_audit_system_actor()}</span>
            <Badge variant="outline" className="text-xs">
              {log.actorType}
            </Badge>
          </div>
        ),
      },
      {
        id: 'operation',
        header: m.admin_audit_col_operation(),
        cell: (log) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.operation}</code>
        ),
      },
      {
        id: 'target',
        header: m.admin_audit_col_target(),
        className: 'text-xs',
        cell: (log) =>
          log.targetType ? (
            <span>
              <span className="text-muted-foreground">{log.targetType}:</span>{' '}
              <code>{log.targetId ?? '-'}</code>
            </span>
          ) : (
            '-'
          ),
      },
      {
        id: 'summary',
        header: m.admin_audit_col_summary(),
        className: 'max-w-md truncate text-sm',
        cell: (log) => log.summary ?? '-',
      },
      {
        id: 'ip',
        header: m.admin_audit_col_ip(),
        className: 'font-mono text-xs text-muted-foreground',
        cell: (log) => log.ipAddress ?? '-',
      },
    ],
    [locale],
  )

  return (
    <DataTable
      columns={columns}
      data={data.logs}
      rowKey={(log) => log.id}
      rowTestId={(log) => `audit-row-${log.id}`}
      emptyIcon={<IconClipboardList aria-hidden />}
      emptyTitle={m.admin_audit_empty()}
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
        <>
          <Input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={m.admin_audit_search_placeholder()}
            aria-label={m.admin_audit_search_placeholder()}
            className="w-64"
            data-testid="audit-search-input"
          />
          {target ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, target: undefined, page: undefined }),
                })
              }
            >
              {m.admin_audit_filter_all()}
            </Button>
          ) : null}
        </>
      }
    />
  )
}
