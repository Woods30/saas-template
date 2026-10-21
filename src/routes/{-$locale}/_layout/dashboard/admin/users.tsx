import {
  IconChevronLeft,
  IconChevronRight,
  IconDevices,
  IconDots,
  IconLayoutColumns,
  IconUsers,
} from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  type AdminUser,
  type AdminUserRoleFilter,
  type AdminUserStatusFilter,
  fetchAdminUsers,
} from '@/auth/admin-users'
import { authClient } from '@/auth/client'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

/** 分页用 offset/limit，`listUsers` 只认 offset。 */
const PAGE_SIZE = 20

/** `banExpiresIn` 的单位是**秒**，界面上按天输入。 */
const SECONDS_PER_DAY = 86_400

/** 搜索防抖：每次按键都打接口既慢又会打乱分页。 */
const SEARCH_DEBOUNCE_MS = 300

/**
 * 用户管理页（admin 专用）。
 *
 * 门禁必须与侧栏可见性（`src/config/settings.ts`）和 `/api/auth/admin/*` 三处一致，
 * 缺一即可绕过；不满足时抛 `notFound()`，不泄漏页面存在。
 * 写操作后需 `load()` + `router.invalidate()`，否则管理员改到自己角色时侧栏不更新。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/users')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  head: () =>
    seo('/dashboard/admin/users', {
      title: m.admin_users_title(),
      description: m.admin_users_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminUsersPage,
})

/** 本页只处理插件默认的两个角色。 */
type UserRole = 'user' | 'admin'

/** 列显隐开关；邮箱与操作列不可隐藏，否则表格失去用途。 */
interface VisibleColumns {
  role: boolean
  status: boolean
  registeredAt: boolean
  banExpiresAt: boolean
}

const DEFAULT_COLUMNS: VisibleColumns = {
  role: true,
  status: true,
  registeredAt: true,
  banExpiresAt: true,
}

/** 列显隐菜单项。渲染期求值，理由同筛选 `items`。 */
function columnToggles(): { key: keyof VisibleColumns; label: string }[] {
  return [
    { key: 'role', label: m.admin_users_col_role() },
    { key: 'status', label: m.admin_users_col_status() },
    { key: 'registeredAt', label: m.admin_users_col_registered_at() },
    { key: 'banExpiresAt', label: m.admin_users_col_ban_expires_at() },
  ]
}

/**
 * `Select` 的 `items`：不传时触发器显示原始值（`all` / `user`）。
 * 必须在渲染期构造，提到模块级会把首次加载的语言固化，切换语言后不再更新。
 */
function roleFilterItems() {
  return [
    { value: 'all', label: m.admin_users_filter_all_roles() },
    { value: 'user', label: m.admin_users_role_user() },
    { value: 'admin', label: m.admin_users_role_admin() },
  ]
}

function statusFilterItems() {
  return [
    { value: 'all', label: m.admin_users_filter_all_statuses() },
    { value: 'active', label: m.admin_users_status_active() },
    { value: 'banned', label: m.admin_users_status_banned() },
  ]
}

function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<AdminUserRoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all')
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(DEFAULT_COLUMNS)

  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null)
  const [roleValue, setRoleValue] = useState<UserRole>('user')
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [sessionsTarget, setSessionsTarget] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminUsers({
        data: {
          search: search || undefined,
          role: roleFilter,
          status: statusFilter,
          limit: PAGE_SIZE,
          offset,
        },
      })
      setError(null)
      setUsers(result.users)
      setTotal(result.total)
    } catch (loadError) {
      // 异常可能是 `Response`（403）或 Error，只取一行文案。
      const message = loadError instanceof Error ? loadError.message.split('\n')[0] : ''
      setError(message || m.settings_error_generic())
    }
  }, [offset, search, roleFilter, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 写操作共用收尾：报错留在页面上（用户要知道哪个操作失败），成功走 toast。
   */
  async function run(
    action: () => Promise<{ error?: { message?: string } | null }>,
    successMessage?: string,
  ) {
    setBusy(true)
    setError(null)
    const { error: actionError } = await action()
    setBusy(false)
    if (actionError) {
      setError(actionError.message?.split('\n')[0] ?? m.settings_error_generic())
      return false
    }
    await load()
    void router.invalidate()
    if (successMessage) toast.add({ type: 'success', title: successMessage })
    return true
  }

  /** 模拟登录：插件会切换 cookie，必须整页跳转，否则侧栏与门禁仍按旧会话。 */
  async function impersonate(user: AdminUser) {
    setBusy(true)
    setError(null)
    const { error: impersonateError } = await authClient.admin.impersonateUser({ userId: user.id })
    setBusy(false)
    if (impersonateError) {
      setError(impersonateError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    window.location.assign(`/${getRequestLocale()}`)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.admin_users_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.admin_users_description()}</p>
      </div>

      {/* 表格不外套 `Card`：`Table` 的边框与圆角已由 globals.css 统一提供。 */}
      <div className="space-y-4">
        {/* 工具行：左侧查询控件，右侧列显隐；布局照 shadcn `dashboard-01`。 */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={m.admin_users_search_placeholder()}
            aria-label={m.admin_users_search_placeholder()}
            className="min-w-48 max-w-sm flex-1"
          />
          {/* 两个筛选都走服务端，切换即重取并把页码归零。 */}
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value as AdminUserRoleFilter)
              setOffset(0)
            }}
            items={roleFilterItems()}
          >
            <SelectTrigger size="sm" aria-label={m.admin_users_filter_role()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.admin_users_filter_all_roles()}</SelectItem>
              <SelectItem value="user">{m.admin_users_role_user()}</SelectItem>
              <SelectItem value="admin">{m.admin_users_role_admin()}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as AdminUserStatusFilter)
              setOffset(0)
            }}
            items={statusFilterItems()}
          >
            <SelectTrigger size="sm" aria-label={m.admin_users_filter_status()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.admin_users_filter_all_statuses()}</SelectItem>
              <SelectItem value="active">{m.admin_users_status_active()}</SelectItem>
              <SelectItem value="banned">{m.admin_users_status_banned()}</SelectItem>
            </SelectContent>
          </Select>
          {/* `ml-auto` 把「列」推到最右：它是呈现设置，与查询控件不同组。 */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="ml-auto" />}
            >
              <IconLayoutColumns data-icon="inline-start" aria-hidden />
              {m.admin_users_columns()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {columnToggles().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={visibleColumns[column.key]}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({ ...current, [column.key]: checked }))
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {users === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconUsers aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{m.admin_users_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              {/* 窄屏按断点逐级收起「注册时间」（lg）与「封禁到期」（xl）。
                  头像并入邮箱列：二者同属身份块，拆开只会多一道分隔线。 */}
              <TableRow>
                <TableHead>{m.admin_users_col_email()}</TableHead>
                {/* 断点与 `visibleColumns` 都满足才渲染；表头与单元格共用同一判定。 */}
                {visibleColumns.role && (
                  <TableHead className="hidden sm:table-cell">{m.admin_users_col_role()}</TableHead>
                )}
                {visibleColumns.status && (
                  <TableHead className="hidden sm:table-cell">
                    {m.admin_users_col_status()}
                  </TableHead>
                )}
                {visibleColumns.registeredAt && (
                  <TableHead className="hidden lg:table-cell">
                    {m.admin_users_col_registered_at()}
                  </TableHead>
                )}
                {visibleColumns.banExpiresAt && (
                  <TableHead className="hidden xl:table-cell">
                    {m.admin_users_col_ban_expires_at()}
                  </TableHead>
                )}
                <TableHead className="text-right">{m.admin_users_col_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  {/* 身份块。表格是 auto 布局，邮箱无断点会顶宽整列，故加 `max-w-64`。 */}
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {user.image && <AvatarImage src={user.image} alt="" />}
                        <AvatarFallback>{userInitial(user)}</AvatarFallback>
                      </Avatar>
                      <div className="grid min-w-0 gap-0.5 leading-tight">
                        <span className="truncate font-medium">{user.name || '—'}</span>
                        <span className="max-w-64 truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  {visibleColumns.role && (
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin'
                          ? m.admin_users_role_admin()
                          : m.admin_users_role_user()}
                      </Badge>
                    </TableCell>
                  )}
                  {visibleColumns.status && (
                    <TableCell className="hidden sm:table-cell">
                      {/* 用圆点而非实心 Badge，避免与角色 Badge 抢注意力。 */}
                      <div className="grid gap-0.5">
                        <span className="inline-flex items-center gap-2">
                          {/* 走语义 token，不写 `emerald-500`：后者不随明暗主题调整。 */}
                          <span
                            aria-hidden
                            className={`size-2 rounded-full ${
                              user.banned ? 'bg-destructive' : 'bg-success'
                            }`}
                          />
                          {user.banned
                            ? m.admin_users_status_banned()
                            : m.admin_users_status_active()}
                        </span>
                        {/* 封禁原因挂在状态下方：单开一列会留下整列 `—`。
                            截断后放进 `Popover`：原生 `title` 在触屏不出现且不换行。 */}
                        {user.banned && user.banReason && (
                          <Popover>
                            <PopoverTrigger className="block max-w-48 truncate pl-4 text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                              {user.banReason}
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64">
                              <PopoverHeader>
                                <PopoverTitle>{m.admin_users_ban_reason_label()}</PopoverTitle>
                                {/* 保留原始断行并允许长词折行，避免长 URL 撑破弹层。 */}
                                <PopoverDescription className="break-words whitespace-pre-wrap">
                                  {user.banReason}
                                </PopoverDescription>
                              </PopoverHeader>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.registeredAt && (
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                  )}
                  {visibleColumns.banExpiresAt && (
                    <TableCell className="hidden xl:table-cell">{formatBanExpiry(user)}</TableCell>
                  )}
                  {/* 宽屏平铺操作按钮，窄屏收进 `DropdownMenu`（复用同一批 handler）。 */}
                  <TableCell className="text-right">
                    <AdminUserActionsMenu
                      user={user}
                      busy={busy}
                      onSetRole={() => {
                        setRoleTarget(user)
                        setRoleValue(user.role === 'admin' ? 'admin' : 'user')
                      }}
                      onToggleBan={() =>
                        user.banned
                          ? void run(
                              () => authClient.admin.unbanUser({ userId: user.id }),
                              m.admin_users_unbanned_toast(),
                            )
                          : setBanTarget(user)
                      }
                      onImpersonate={() => void impersonate(user)}
                      onSessions={() => setSessionsTarget(user)}
                      onDelete={() => setDeleteTarget(user)}
                    />
                    <div className="hidden justify-end gap-2 lg:flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRoleTarget(user)
                          setRoleValue(user.role === 'admin' ? 'admin' : 'user')
                        }}
                      >
                        {m.admin_users_set_role()}
                      </Button>
                      {user.banned ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => authClient.admin.unbanUser({ userId: user.id }),
                              m.admin_users_unbanned_toast(),
                            )
                          }
                        >
                          {m.admin_users_unban()}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setBanTarget(user)}
                        >
                          {m.admin_users_ban()}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || user.role === 'admin'}
                        title={
                          user.role === 'admin' ? m.admin_users_impersonate_admin_hint() : undefined
                        }
                        onClick={() => void impersonate(user)}
                      >
                        {m.admin_users_impersonate()}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSessionsTarget(user)}
                      >
                        {m.admin_users_sessions_title()}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                      >
                        {m.admin_users_delete()}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {users !== null && users.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {m.admin_users_page({ page: currentPage, total: totalPages })}
            </p>
            {/* 页码是客户端状态而非 URL，故用按钮而非链接。 */}
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    <IconChevronLeft data-icon="inline-start" aria-hidden />
                    {m.admin_users_prev()}
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    {m.admin_users_next()}
                    <IconChevronRight data-icon="inline-end" aria-hidden />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      <Dialog open={roleTarget !== null} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_users_set_role_title()}</DialogTitle>
            <DialogDescription>{roleTarget?.email}</DialogDescription>
          </DialogHeader>
          <Select value={roleValue} onValueChange={(value) => setRoleValue(value as UserRole)}>
            <SelectTrigger aria-label={m.admin_users_col_role()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{m.admin_users_role_user()}</SelectItem>
              <SelectItem value="admin">{m.admin_users_role_admin()}</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.admin_users_cancel()}
            </DialogClose>
            <Button
              type="button"
              disabled={busy || roleValue === (roleTarget?.role ?? 'user')}
              onClick={async () => {
                if (!roleTarget) return
                if (
                  await run(
                    () => authClient.admin.setRole({ userId: roleTarget.id, role: roleValue }),
                    m.admin_users_role_updated_toast(),
                  )
                ) {
                  setRoleTarget(null)
                }
              }}
            >
              {m.admin_users_set_role_submit()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 封禁：原因 + 可选时长（天），留空即永久。 */}
      <BanDialog
        target={banTarget}
        busy={busy}
        onClose={() => setBanTarget(null)}
        onSubmit={(banReason, days) =>
          run(
            () =>
              authClient.admin.banUser({
                userId: banTarget?.id ?? '',
                ...(banReason ? { banReason } : {}),
                ...(days > 0 ? { banExpiresIn: days * SECONDS_PER_DAY } : {}),
              }),
            m.admin_users_banned_toast(),
          )
        }
      />

      <UserSessionsDialog
        target={sessionsTarget}
        onClose={() => setSessionsTarget(null)}
        onError={(message) => setError(message)}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.admin_users_delete_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.admin_users_delete_confirm_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.admin_users_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return
                if (
                  await run(
                    () => authClient.admin.removeUser({ userId: deleteTarget.id }),
                    m.admin_users_deleted_toast(),
                  )
                ) {
                  setDeleteTarget(null)
                }
              }}
            >
              {m.admin_users_delete_confirm_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 封禁弹窗。表单状态独立，关掉再开应回到空白。 */
function BanDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: AdminUser | null
  busy: boolean
  onClose: () => void
  onSubmit: (banReason: string, days: number) => Promise<boolean>
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_users_ban_title()}</DialogTitle>
          <DialogDescription>{target?.email}</DialogDescription>
        </DialogHeader>
        {/* `key` 让换用户时重建表单，输入随之归零。 */}
        {target && <BanForm key={target.id} busy={busy} onCancel={onClose} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function BanForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (banReason: string, days: number) => Promise<boolean>
}) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')

  const parsedDays = Number.parseInt(days, 10)
  const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 0

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ban-reason">{m.admin_users_ban_reason_label()}</Label>
          <Input
            id="ban-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ban-expires">{m.admin_users_ban_expires_label()}</Label>
          <Input
            id="ban-expires"
            type="number"
            min={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {m.admin_users_cancel()}
        </DialogClose>
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await onSubmit(reason.trim(), safeDays)) onCancel()
          }}
        >
          {m.admin_users_ban_submit()}
        </Button>
      </DialogFooter>
    </>
  )
}

/** `listUserSessions` 返回的会话条目（只取表格用到的字段）。 */
interface UserSession {
  id: string
  token: string
  createdAt: Date | string
  expiresAt: Date | string
  userAgent?: string | null
  impersonatedBy?: string | null
}

/**
 * 某用户的登录设备弹窗。
 *
 * 走 admin 插件自带的会话接口：权限、级联与 cookie 失效都由插件负责，
 * 不要另写会话表查询。撤销后需重新拉取列表。
 */
function UserSessionsDialog({
  target,
  onClose,
  onError,
}: {
  target: AdminUser | null
  onClose: () => void
  onError: (message: string) => void
}) {
  const [sessions, setSessions] = useState<UserSession[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (userId: string) => {
      const { data, error } = await authClient.admin.listUserSessions({ userId })
      if (error) {
        onError(error.message?.split('\n')[0] ?? m.settings_error_generic())
        setSessions([])
        return
      }
      setSessions((data?.sessions as UserSession[] | undefined) ?? [])
    },
    [onError],
  )

  useEffect(() => {
    if (!target) {
      setSessions(null)
      return
    }
    void load(target.id)
  }, [target, load])

  async function revoke(action: () => Promise<{ error?: { message?: string } | null }>) {
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) {
      onError(error.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    if (target) await load(target.id)
    toast.add({ type: 'success', title: m.admin_users_sessions_revoked_toast() })
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_users_sessions_title()}</DialogTitle>
          <DialogDescription>
            {target?.email} · {m.admin_users_sessions_description()}
          </DialogDescription>
        </DialogHeader>
        {sessions === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconDevices aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{m.admin_users_sessions_empty()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.settings_sessions_created()}</TableHead>
                <TableHead>{m.settings_sessions_expires()}</TableHead>
                <TableHead className="text-right">{m.admin_users_sessions_revoke()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{formatDate(session.createdAt)}</TableCell>
                  <TableCell>{formatDate(session.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void revoke(() =>
                          authClient.admin.revokeUserSession({ sessionToken: session.token }),
                        )
                      }
                    >
                      {m.admin_users_sessions_revoke()}
                    </Button>
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
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !target || sessions === null || sessions.length === 0}
            onClick={() =>
              target &&
              void revoke(() => authClient.admin.revokeUserSessions({ userId: target.id }))
            }
          >
            {m.admin_users_sessions_revoke_all()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 窄屏下的行操作入口。
 *
 * 宽屏（`lg` 以上）仍平铺按钮——管理操作需要一眼可见，藏进菜单反而多一次点击。
 */
function AdminUserActionsMenu({
  user,
  busy,
  onSetRole,
  onToggleBan,
  onImpersonate,
  onSessions,
  onDelete,
}: {
  user: AdminUser
  busy: boolean
  onSetRole: () => void
  onToggleBan: () => void
  onImpersonate: () => void
  onSessions: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.admin_users_col_actions()}
            disabled={busy}
          />
        }
        className="lg:hidden"
      >
        <IconDots aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-40">
        <DropdownMenuItem onClick={onSetRole}>{m.admin_users_set_role()}</DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleBan} disabled={busy}>
          {user.banned ? m.admin_users_unban() : m.admin_users_ban()}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onImpersonate}
          disabled={busy || user.role === 'admin'}
          title={user.role === 'admin' ? m.admin_users_impersonate_admin_hint() : undefined}
        >
          {m.admin_users_impersonate()}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSessions}>{m.admin_users_sessions_title()}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          {m.admin_users_delete()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 「封禁到期」列。
 *
 * 三种取值须分开表达：未封禁 → `—`，已封禁且无 `banExpires` → 「永久」，
 * 否则格式化时间。这里只做展示，不重复判断是否已过期。
 */
function formatBanExpiry(user: AdminUser): string {
  if (!user.banned) return '—'
  if (!user.banExpires) return m.admin_users_ban_permanent()
  return formatDate(user.banExpires)
}

/** 头像回退字母：取姓名首字符，缺失时退回邮箱首字符。 */
function userInitial(user: AdminUser): string {
  return (user.name?.trim() || user.email).charAt(0).toUpperCase()
}

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
