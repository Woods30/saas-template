import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

/** 每页条数。分页用 offset/limit，不用页码——`listUsers` 只认 offset。 */
const PAGE_SIZE = 20

/** `banExpiresIn` 的单位是**秒**，界面上按天输入。 */
const SECONDS_PER_DAY = 86_400

/** 搜索防抖：每次按键都打接口既慢又会打乱分页。 */
const SEARCH_DEBOUNCE_MS = 300

/**
 * 用户管理页（admin 专用）。
 *
 * 双重门禁：功能开关（`features.enableAdmin`）与角色（`role === 'admin'`）都满足才可进入；
 * 任一不满足抛 `notFound()` 以 404 呈现，不向非管理员泄漏该页存在。与侧栏项的可见性
 * （`src/config/settings.ts` 的 `visibility`）同源，也与 `/api/auth/admin/*` 的 API 侧
 * 门禁一致——三处缺一不可。
 *
 * 数据全部走 `authClient.admin.*`：写操作后 `load()` 重取列表，并 `router.invalidate()`
 * 让父路由重新读会话——管理员改到自己角色时，侧栏与门禁都要跟着变。
 */
export const Route = createFileRoute('/{-$locale}/_layout/dashboard/admin/users')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  head: () => {
    const base = seo('/dashboard/admin/users', {
      title: m.admin_users_title(),
      description: m.admin_users_description(),
      locale: getRequestLocale(),
    })
    return { ...base, meta: [...base.meta, { name: 'robots', content: 'noindex' }] }
  },
  component: AdminUsersPage,
})

/** `listUsers` 返回的用户条目。`role` 可空：非 admin 插件写入前可能为空。 */
interface AdminUser {
  id: string
  email: string
  name?: string | null
  role?: string | null
  banned?: boolean | null
  createdAt: Date | string
}

function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 输入框与生效的查询分开：输入即时回显，查询走防抖。
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // 三个写操作各自记录目标行（null 表示弹窗关闭）。
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null)
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    const { data, error: listError } = await authClient.admin.listUsers({
      query: {
        limit: PAGE_SIZE,
        offset,
        searchField: 'email',
        ...(search ? { searchValue: search } : {}),
      },
    })
    if (listError) {
      setError(listError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    setError(null)
    setUsers((data?.users as AdminUser[] | undefined) ?? [])
    setTotal(data?.total ?? 0)
  }, [offset, search])

  useEffect(() => {
    void load()
  }, [load])

  /** 写操作共用收尾：报错则展示，成功则重取列表并刷新会话。 */
  async function run(action: () => Promise<{ error?: { message?: string } | null }>) {
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
    return true
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{m.admin_users_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.admin_users_description()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.admin_users_title()}</CardTitle>
          <CardDescription>{m.admin_users_description()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={m.admin_users_search_placeholder()}
            aria-label={m.admin_users_search_placeholder()}
          />

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
            <p className="text-sm text-muted-foreground">{m.admin_users_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.admin_users_col_email()}</TableHead>
                  <TableHead>{m.admin_users_col_name()}</TableHead>
                  <TableHead>{m.admin_users_col_role()}</TableHead>
                  <TableHead>{m.admin_users_col_status()}</TableHead>
                  <TableHead>{m.admin_users_col_created_at()}</TableHead>
                  <TableHead className="text-right">{m.admin_users_col_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    {/* 邮箱与姓名由用户输入，React 默认转义。 */}
                    <TableCell className="font-mono text-xs">{user.email}</TableCell>
                    <TableCell>{user.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin'
                          ? m.admin_users_role_admin()
                          : m.admin_users_role_user()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">{m.admin_users_status_banned()}</Badge>
                      ) : (
                        <Badge variant="outline">{m.admin_users_status_active()}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="space-x-2 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRoleTarget(user)}
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
                            void run(() => authClient.admin.unbanUser({ userId: user.id }))
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
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                      >
                        {m.admin_users_delete()}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {users !== null && users.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {m.admin_users_page({ page: currentPage, total: totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {m.admin_users_prev()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {m.admin_users_next()}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 改角色：没有 shadcn select，用按钮组表达二选一。 */}
      <Dialog open={roleTarget !== null} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_users_set_role_title()}</DialogTitle>
            <DialogDescription>{roleTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!roleTarget) return
                if (
                  await run(() => authClient.admin.setRole({ userId: roleTarget.id, role: 'user' }))
                ) {
                  setRoleTarget(null)
                }
              }}
            >
              {m.admin_users_role_user()}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!roleTarget) return
                if (
                  await run(() =>
                    authClient.admin.setRole({ userId: roleTarget.id, role: 'admin' }),
                  )
                ) {
                  setRoleTarget(null)
                }
              }}
            >
              {m.admin_users_role_admin()}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.admin_users_cancel()}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 封禁：原因 + 可选时长（天）；留空即永久。 */}
      <BanDialog
        target={banTarget}
        busy={busy}
        onClose={() => setBanTarget(null)}
        onSubmit={(banReason, days) =>
          run(() =>
            authClient.admin.banUser({
              userId: banTarget?.id ?? '',
              ...(banReason ? { banReason } : {}),
              ...(days > 0 ? { banExpiresIn: days * SECONDS_PER_DAY } : {}),
            }),
          )
        }
      />

      {/* 删除确认 */}
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
                if (await run(() => authClient.admin.removeUser({ userId: deleteTarget.id }))) {
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

/** 封禁弹窗。表单状态独立于页面：关掉再开应回到空白，而不是留着上次的输入。 */
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
        {/* `key` 让换用户时重建表单，输入随之归零——比在 effect 里手动 reset 更不易漏。 */}
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

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
