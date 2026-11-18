import { IconPlayerStop, IconPlus, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
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
  cancelAdminAiTask,
  createDemoAdminAiTask,
  fetchAdminAiTasks,
  refreshAdminAiTask,
} from '@/modules/ai-tasks/service'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

interface AdminTasksSearch {
  page?: number
  q?: string
  status?: string
}

export const Route = createFileRoute('/{-$locale}/_layout/admin/tasks')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  validateSearch: (search: Record<string, unknown>): AdminTasksSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
    const q = typeof search.q === 'string' ? search.q : ''
    const status = typeof search.status === 'string' ? search.status : 'all'
    return { page, q, status }
  },
  loaderDeps: ({ search }) => ({
    page: search.page ?? 1,
    q: search.q ?? '',
    status: search.status ?? 'all',
  }),
  loader: ({ deps }) =>
    fetchAdminAiTasks({
      data: {
        search: deps.q || undefined,
        status: deps.status && deps.status !== 'all' ? deps.status : undefined,
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      },
    }),
  head: () =>
    seo('/admin/tasks', {
      title: m.admin_tasks_title(),
      description: m.admin_tasks_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminAiTasksPage,
})

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'default'
    case 'processing':
    case 'pending':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

function AdminAiTasksPage() {
  const data = Route.useLoaderData()
  const { page = 1, q = '', status = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const locale = getRequestLocale()

  const [keyword, setKeyword] = useState(q)
  const [createOpen, setCreateOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('mock-flux-1')
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'audio' | 'speech'>(
    'image',
  )
  const [mode, setMode] = useState<'sync-succeed' | 'async-succeed' | 'async-fail'>('async-succeed')
  const [costCredits, setCostCredits] = useState('10')
  const [submitting, setSubmitting] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)

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

  async function handleCreateDemo(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || submitting) return
    setSubmitting(true)
    try {
      await createDemoAdminAiTask({
        data: {
          mediaType,
          model: model.trim() || 'mock-flux-1',
          prompt: prompt.trim(),
          mode,
          costCredits: Math.max(0, Number.parseInt(costCredits, 10) || 0),
        },
      })
      setCreateOpen(false)
      setPrompt('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefreshTask(taskId: string) {
    setBusyTaskId(taskId)
    try {
      await refreshAdminAiTask({ data: { taskId } })
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setBusyTaskId(null)
    }
  }

  async function handleCancelTask(taskId: string) {
    setBusyTaskId(taskId)
    try {
      await cancelAdminAiTask({ data: { taskId } })
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setBusyTaskId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{m.admin_tasks_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.admin_tasks_description()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={m.admin_tasks_search_placeholder()}
            aria-label={m.admin_tasks_search_placeholder()}
            className="w-56"
            data-testid="tasks-search-input"
          />
          <select
            value={status}
            onChange={(e) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  status: e.target.value === 'all' ? undefined : e.target.value,
                  page: 1,
                }),
              })
            }
            aria-label={m.admin_tasks_col_status()}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="tasks-status-filter"
          >
            <option value="all">{m.admin_tasks_filter_all()}</option>
            <option value="processing">{m.admin_tasks_filter_processing()}</option>
            <option value="succeeded">{m.admin_tasks_filter_succeeded()}</option>
            <option value="failed">{m.admin_tasks_filter_failed()}</option>
            <option value="canceled">{m.admin_tasks_filter_canceled()}</option>
          </select>
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="create-demo-task-button"
          >
            <IconPlus className="mr-1.5 size-4" />
            {m.admin_tasks_create_demo()}
          </Button>
        </div>
      </div>

      {data.tasks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconSparkles className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{m.admin_tasks_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.admin_tasks_col_created_at()}</TableHead>
                <TableHead>{m.admin_tasks_col_user()}</TableHead>
                <TableHead>{m.admin_tasks_col_model()}</TableHead>
                <TableHead>{m.admin_tasks_col_prompt()}</TableHead>
                <TableHead>{m.admin_tasks_col_status()}</TableHead>
                <TableHead>{m.admin_tasks_col_credits()}</TableHead>
                <TableHead className="text-right">{m.admin_tasks_col_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tasks.map((item) => {
                const isRunning = item.status === 'processing' || item.status === 'pending'
                const isBusy = busyTaskId === item.id
                return (
                  <TableRow key={item.id} data-testid={`task-row-${item.id}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <LocalDateTime value={item.createdAt} locale={locale} />
                    </TableCell>
                    <TableCell className="text-sm">{item.userEmail ?? item.userId}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.model}</code>
                        <Badge variant="outline" className="text-xs">
                          {item.mediaType}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{item.prompt}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusBadgeVariant(item.status)} className="w-fit">
                          {item.status}
                        </Badge>
                        {item.errorMessage ? (
                          <span className="max-w-xs truncate text-xs text-destructive">
                            {item.errorMessage}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{item.costCredits}</span>
                        {item.refundTxId ? (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            data-testid={`task-refunded-${item.id}`}
                          >
                            {m.admin_tasks_refunded_badge()}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {isRunning ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleRefreshTask(item.id)}
                            data-testid={`refresh-task-${item.id}`}
                          >
                            {isBusy ? (
                              <Spinner className="mr-1 size-3.5" />
                            ) : (
                              <IconRefresh className="mr-1 size-3.5" />
                            )}
                            {m.admin_tasks_refresh()}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleCancelTask(item.id)}
                            data-testid={`cancel-task-${item.id}`}
                          >
                            <IconPlayerStop className="mr-1 size-3.5" />
                            {m.admin_tasks_cancel()}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {m.admin_tasks_page_status({ page: String(page), total: String(totalPages) })}
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
              {m.admin_tasks_page_prev()}
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
              {m.admin_tasks_page_next()}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_tasks_create_demo_title()}</DialogTitle>
            <DialogDescription>{m.admin_tasks_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDemo} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-media-type">{m.admin_tasks_field_media_type()}</Label>
                <select
                  id="task-media-type"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as typeof mediaType)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="image">image</option>
                  <option value="video">video</option>
                  <option value="text">text</option>
                  <option value="audio">audio</option>
                  <option value="speech">speech</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-model">{m.admin_tasks_field_model()}</Label>
                <Input
                  id="task-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-mode">{m.admin_tasks_field_mode()}</Label>
                <select
                  id="task-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="task-mode-select"
                >
                  <option value="async-succeed">{m.admin_tasks_mode_async_succeed()}</option>
                  <option value="async-fail">{m.admin_tasks_mode_async_fail()}</option>
                  <option value="sync-succeed">{m.admin_tasks_mode_sync_succeed()}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-credits">{m.admin_tasks_field_credits()}</Label>
                <Input
                  id="task-credits"
                  type="number"
                  min={0}
                  max={1000}
                  value={costCredits}
                  onChange={(e) => setCostCredits(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-prompt">{m.admin_tasks_field_prompt()}</Label>
              <Input
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
                data-testid="task-prompt-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_tasks_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="submit-demo-task">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_tasks_submit_demo()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
