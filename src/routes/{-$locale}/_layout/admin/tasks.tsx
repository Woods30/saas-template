import { IconPlayerStop, IconPlus, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { adminRoutes } from '@/config/routes'
import { DEFAULT_PAGE_SIZE } from '@/core/db/paging'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { getRequestLocale } from '@/lib/locale'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'
import {
  type AdminAiTaskItem,
  cancelAdminAiTask,
  createDemoAdminAiTask,
  fetchAdminAiTasks,
  refreshAdminAiTask,
} from '@/modules/ai-tasks/service'

interface AdminTasksSearch {
  page?: number
  q?: string
  status?: string
}

export const Route = createFileRoute('/{-$locale}/_layout/admin/tasks')({
  validateSearch: (search: Record<string, unknown>): AdminTasksSearch => {
    const parsed = Number(search.page)
    const page = Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
    const q = typeof search.q === 'string' && search.q ? search.q : undefined
    const status =
      typeof search.status === 'string' && search.status !== 'all' ? search.status : undefined
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
        limit: DEFAULT_PAGE_SIZE,
        offset: (deps.page - 1) * DEFAULT_PAGE_SIZE,
      },
    }),
  head: () => adminHead(adminRoutes.tasks),
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

  const debouncedKeyword = useDebouncedValue(keyword)

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

  const handleRefreshTask = useCallback(
    async (taskId: string) => {
      setBusyTaskId(taskId)
      try {
        await refreshAdminAiTask({ data: { taskId } })
        await router.invalidate()
      } catch {
        toast.add({ type: 'error', title: m.settings_error_generic() })
      } finally {
        setBusyTaskId(null)
      }
    },
    [router],
  )

  const handleCancelTask = useCallback(
    async (taskId: string) => {
      setBusyTaskId(taskId)
      try {
        await cancelAdminAiTask({ data: { taskId } })
        await router.invalidate()
      } catch {
        toast.add({ type: 'error', title: m.settings_error_generic() })
      } finally {
        setBusyTaskId(null)
      }
    },
    [router],
  )

  const columns = useMemo<DataTableColumn<AdminAiTaskItem>[]>(
    () => [
      {
        id: 'createdAt',
        header: m.admin_tasks_col_created_at(),
        className: 'whitespace-nowrap text-xs text-muted-foreground',
        cell: (task) => <LocalDateTime value={task.createdAt} locale={locale} />,
      },
      {
        id: 'user',
        header: m.admin_tasks_col_user(),
        className: 'text-sm',
        cell: (task) => task.userEmail ?? task.userId,
      },
      {
        id: 'model',
        header: m.admin_tasks_col_model(),
        cell: (task) => (
          <div className="flex items-center gap-1.5">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{task.model}</code>
            <Badge variant="outline" className="text-xs">
              {task.mediaType}
            </Badge>
          </div>
        ),
      },
      {
        id: 'prompt',
        header: m.admin_tasks_col_prompt(),
        className: 'max-w-xs truncate text-sm',
        cell: (task) => task.prompt,
      },
      {
        id: 'status',
        header: m.admin_tasks_col_status(),
        cell: (task) => (
          <div className="flex flex-col gap-1">
            <Badge variant={statusBadgeVariant(task.status)} className="w-fit">
              {task.status}
            </Badge>
            {task.errorMessage ? (
              <span className="max-w-xs truncate text-xs text-destructive">
                {task.errorMessage}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'credits',
        header: m.admin_tasks_col_credits(),
        className: 'text-sm',
        cell: (task) => (
          <div className="flex items-center gap-1.5">
            <span className="font-mono">{task.costCredits}</span>
            {task.refundTxId ? (
              <Badge variant="outline" className="text-xs" data-testid={`task-refunded-${task.id}`}>
                {m.admin_tasks_refunded_badge()}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: m.admin_tasks_col_actions(),
        className: 'text-right',
        cell: (task) => {
          const isRunning = task.status === 'processing' || task.status === 'pending'
          if (!isRunning) return <span className="text-xs text-muted-foreground">-</span>
          const isBusy = busyTaskId === task.id
          return (
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void handleRefreshTask(task.id)}
                data-testid={`refresh-task-${task.id}`}
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
                onClick={() => void handleCancelTask(task.id)}
                data-testid={`cancel-task-${task.id}`}
              >
                <IconPlayerStop className="mr-1 size-3.5" />
                {m.admin_tasks_cancel()}
              </Button>
            </div>
          )
        },
      },
    ],
    [busyTaskId, handleCancelTask, handleRefreshTask, locale],
  )

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={data.tasks}
        rowKey={(task) => task.id}
        rowTestId={(task) => `task-row-${task.id}`}
        emptyIcon={<IconSparkles aria-hidden />}
        emptyTitle={m.admin_tasks_empty()}
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
              placeholder={m.admin_tasks_search_placeholder()}
              aria-label={m.admin_tasks_search_placeholder()}
              className="w-56"
              data-testid="tasks-search-input"
            />
            <select
              value={status}
              onChange={(event) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    status: event.target.value === 'all' ? undefined : event.target.value,
                    page: undefined,
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
          </>
        }
      />

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
                  onChange={(event) => setMediaType(event.target.value as typeof mediaType)}
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
                  onChange={(event) => setModel(event.target.value)}
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
                  onChange={(event) => setMode(event.target.value as typeof mode)}
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
                  onChange={(event) => setCostCredits(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-prompt">{m.admin_tasks_field_prompt()}</Label>
              <Input
                id="task-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
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
