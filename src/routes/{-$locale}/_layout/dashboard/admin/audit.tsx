import { IconClipboardList } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { fetchAdminAuditLogs } from '@/modules/audit/service'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

interface AdminAuditSearch {
  page?: number
  q?: string
  target?: string
}

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/audit')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  validateSearch: (search: Record<string, unknown>): AdminAuditSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
    const q = typeof search.q === 'string' ? search.q : ''
    const target = typeof search.target === 'string' ? search.target : ''
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
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      },
    }),
  head: () =>
    seo('/dashboard/admin/audit', {
      title: m.admin_audit_title(),
      description: m.admin_audit_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminAuditPage,
})

function AdminAuditPage() {
  const data = Route.useLoaderData()
  const { page = 1, q = '', target = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const locale = getRequestLocale()

  const [keyword, setKeyword] = useState(q)

  useEffect(() => {
    setKeyword(q)
  }, [q])

  useEffect(() => {
    if (keyword === q) return
    const timer = setTimeout(() => {
      void navigate({
        search: (prev) => ({ ...prev, q: keyword || undefined, page: 1 }),
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword, q, navigate])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{m.admin_audit_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.admin_audit_description()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
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
                  search: (prev) => ({ ...prev, target: undefined, page: 1 }),
                })
              }
            >
              {m.admin_audit_filter_all()}
            </Button>
          ) : null}
        </div>
      </div>

      {data.logs.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconClipboardList className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{m.admin_audit_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.admin_audit_col_created_at()}</TableHead>
                <TableHead>{m.admin_audit_col_actor()}</TableHead>
                <TableHead>{m.admin_audit_col_operation()}</TableHead>
                <TableHead>{m.admin_audit_col_target()}</TableHead>
                <TableHead>{m.admin_audit_col_summary()}</TableHead>
                <TableHead>{m.admin_audit_col_ip()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs.map((item) => (
                <TableRow key={item.id} data-testid={`audit-row-${item.id}`}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    <LocalDateTime value={item.createdAt} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">
                        {item.actorEmail ?? m.admin_audit_system_actor()}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {item.actorType}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.operation}</code>
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.targetType ? (
                      <span>
                        <span className="text-muted-foreground">{item.targetType}:</span>{' '}
                        <code>{item.targetId ?? '-'}</code>
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm">{item.summary ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.ipAddress ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {m.admin_audit_page_status({ page: String(page), total: String(totalPages) })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, page: Math.max(1, page - 1) }),
                })
              }
            >
              {m.admin_audit_page_prev()}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, page: page + 1 }),
                })
              }
            >
              {m.admin_audit_page_next()}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
