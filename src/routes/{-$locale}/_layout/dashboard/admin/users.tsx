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
  head: () =>
    seo('/dashboard/admin/users', {
      title: m.admin_users_title(),
      description: m.admin_users_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminUsersPage,
})

/** 本页只处理插件默认的两个角色；`adminRoles` 未自定义，故无需更宽的联合类型。 */
type UserRole = 'user' | 'admin'

/**
 * 列显隐开关。
 *
 * 只覆盖「数据列」——邮箱（身份块）与操作列不可隐藏：前者是唯一的身份标识，
 * 后者是本页所有管理动作的入口，藏起来等于让表格失去用途。
 */
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

/** 列显隐菜单项。渲染期求值，理由同下面的筛选 `items`。 */
function columnToggles(): { key: keyof VisibleColumns; label: string }[] {
  return [
    { key: 'role', label: m.admin_users_col_role() },
    { key: 'status', label: m.admin_users_col_status() },
    { key: 'registeredAt', label: m.admin_users_col_registered_at() },
    { key: 'banExpiresAt', label: m.admin_users_col_ban_expires_at() },
  ]
}

/**
 * `Select` 的 `items`：Base UI 用它把「当前值」翻译成触发器上的文案。
 * 只传 `value` 而不传 `items` 时，触发器会显示原始值（`all` / `user`）。
 *
 * 必须在渲染期构造而不是模块顶层常量：`m.*()` 在调用时才读当前语言，
 * 提到模块级会把首次加载的语言固化下来，切换语言后下拉文案不再变。
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

  // 输入框与生效的查询分开：输入即时回显，查询走防抖。
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // 两个下拉筛选同样参与服务端查询，改动即重取并把页码归零。
  const [roleFilter, setRoleFilter] = useState<AdminUserRoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all')
  // 列显隐：只影响呈现，不参与查询。默认值与表头里的断点类一致——
  // 小屏本来就靠 `hidden sm:table-cell` 收起，这里额外给用户一个手动开关。
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(DEFAULT_COLUMNS)

  // 三个写操作各自记录目标行（null 表示弹窗关闭）。
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null)
  // 弹窗内待提交的角色；打开弹窗时同步为当前角色，避免沿用上一行的选择。
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
      // server function 的异常可能是 `Response`（403）或 Error；两种都只取一行文案。
      const message = loadError instanceof Error ? loadError.message.split('\n')[0] : ''
      setError(message || m.settings_error_generic())
    }
  }, [offset, search, roleFilter, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 写操作共用收尾：报错则展示，成功则重取列表并刷新会话。
   *
   * `successMessage` 是这个动作的「做成了」反馈，走 toast。错误仍留在页面上——
   * 失败时用户需要知道**哪个操作**失败，toast 一闪而过不够。
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

  /**
   * 模拟登录：由插件创建一条带 `impersonated_by` 的会话并切换 cookie。
   * 成功后整页跳转到首页——身份已变，工作台侧栏与门禁都得按新会话重算。
   */
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

      {/* 表格直接放在内容区，外面不再套 `Card`。

          与 API 密钥页同一套：`Table` 的滚动容器已由 globals.css 统一给了边框 + 圆角，
          `TableHeader` 给了 `sticky top-0 bg-muted`。外面再套一张卡就是「框里套框」——
          卡片一道边框、表格又一道，两圈间距还不等宽。

          工具行（搜索）与分页行都贴在表格外侧，用 `flex justify-between` 与表格
          共享同一套留白，参照 shadcn `dashboard-01` 的 DataTable 写法。 */}
      <div className="space-y-4">
        {/* 工具行：搜索 + 角色 / 状态筛选 + 列显隐。

            布局照 shadcn `dashboard-01` 的 DataTable：左侧是查询控件，右侧是
            「Columns」下拉。窄屏允许换行（`flex-wrap`），筛选器各自保持自然宽度，
            不压缩到看不清标签。 */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={m.admin_users_search_placeholder()}
            aria-label={m.admin_users_search_placeholder()}
            className="min-w-48 max-w-sm flex-1"
          />
          {/* 两个筛选都走服务端：`fetchAdminUsers` 接受组合条件，切换即重取并把
              页码归零，翻页后看到的仍是完整结果集里的下一页。 */}
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
          {/* `ml-auto` 把「列」推到工具行最右：它是呈现设置，与左侧的查询控件
              不同组。换行后（窄屏）自动落到第二行右端，仍然对齐。 */}
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
              {/* 六列 + 操作在窄屏放不下：按断点逐级收起「注册时间」（lg）与
                  「封禁到期」（xl），操作列在窄屏收进菜单。被收起的列在宽屏上照常显示。

                  头像并入「用户」列而不是单开一列：头像、姓名、邮箱是同一个身份块，
                  拆成两列后两者之间会多出一道无意义的分隔线，窄屏还要多收一列。
                  表头文案仍写「邮箱」，因为它同时是这一列的搜索字段
                  （`listUsers` 的 `searchField: 'email'`）。 */}
              <TableRow>
                <TableHead>{m.admin_users_col_email()}</TableHead>
                {/* 两个条件同时成立才渲染：断点（窄屏天然收起）与用户手动开关
                    （`visibleColumns`）。表头与单元格读同一份判定，不会错位。 */}
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
                  {/* 身份块：头像 + 姓名 + 邮箱，纵向两行。

                      姓名与邮箱由用户输入，React 默认转义。表格是 auto 布局，
                      `max-w-*` / `truncate` 都约束不住单元格宽度——邮箱本身没有断点，
                      会把列顶到最长的那一条。这里给 `max-w-64` 并允许断行。
                      字号与字体都跟随表格默认（`text-sm` / `--font-sans`）：邮箱是正文
                      数据不是代码，早先的 `font-mono text-xs` 会让这一列在表格里显得
                      又小又异样——tweakcn 的所有单元格都是同一套。 */}
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
                      {/* 状态用「圆点 + 文案」而不是实心 Badge：Badge 的色块在六列表格里
                        会和其他彩色元素（角色 Badge、操作按钮）抢注意力，而状态只需
                        一眼扫过。绿点 = 正常，红点 = 已封禁，与 Avatar 的
                        `AvatarBadge` 同一套语义。 */}
                      <div className="grid gap-0.5">
                        <span className="inline-flex items-center gap-2">
                          {/* 颜色走语义 token（`--destructive` / `--success`），不写
                            Tailwind 的 `emerald-500`：后者不随主题明暗调整，深色下会偏刺眼。 */}
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
                        {/* 封禁原因挂在状态下方而不是单开一列：它只对「已封禁」有值，
                          单开会留下整列 `—`；也不放进操作菜单——管理员扫表时最先想知道的
                          就是「为什么被封」。

                          单元格宽度有限，原因一律截断，完整内容放进 `Popover` 点击展开：
                          原生 `title` 在触屏上不出现、长文本也不换行，不适合承载这段
                          可能由管理员自由填写的文字。触发器是一段带虚线的文字而不是
                          图标，读起来仍像表格内容，只是暗示「可以点开」。 */}
                        {user.banned && user.banReason && (
                          <Popover>
                            <PopoverTrigger className="block max-w-48 truncate pl-4 text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                              {user.banReason}
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64">
                              <PopoverHeader>
                                <PopoverTitle>{m.admin_users_ban_reason_label()}</PopoverTitle>
                                {/* 原因来自管理员输入，可能带换行；保留原始断行并允许长词
                                  折行，避免一条长 URL / 连续字符撑破弹层。 */}
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
                  {/* 四个操作按钮在窄屏既放不下、换行后每行又只剩一个词。宽屏保持
                      平铺（一眼可见、一次点击），窄屏收进 `DropdownMenu` 的「操作」
                      菜单——这是 shadcn 数据表在移动端的常规做法，菜单项复用同一批
                      handler，没有第二套逻辑。 */}
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
            {/* 分页用 `Pagination` 组合件；页面本身是客户端状态而非 URL，
                因此用按钮承载上一页 / 下一页，而不是链接。 */}
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

      {/* 改角色：没有 shadcn select，用按钮组表达二选一。 */}
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

      {/* 封禁：原因 + 可选时长（天）；留空即永久。 */}
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

      {/* 该用户的登录设备：管理员排查可疑登录 / 踢掉被盗会话的入口。 */}
      <UserSessionsDialog
        target={sessionsTarget}
        onClose={() => setSessionsTarget(null)}
        onError={(message) => setError(message)}
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
 * 走插件的 `listUserSessions` / `revokeUserSession` / `revokeUserSessions`——这是
 * admin 插件自带的能力，比另写一套会话表查询更可靠（权限、级联、cookie 失效都由
 * 插件负责）。撤销后重新拉取列表，让界面与真实状态一致。
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
 * 四个操作按钮在 390px 下会把表格撑到 450px 以上，换行后又每行只剩一个词。这里把它们
 * 收进 `DropdownMenu`：触发按钮只占一个图标位，菜单项与宽屏按钮共用同一批回调。
 * 宽屏（`md` 以上）仍平铺按钮——管理操作需要一眼可见，藏在菜单里反而多一次点击。
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
 * 「封禁到期」列：封禁到期时间。
 *
 * 三种取值要分开表达，否则表格里会出现三个一模一样的「—」：
 * - 未封禁 → `—`（这一列对它没有意义）；
 * - 已封禁且 `banExpires` 为空 → 「永久」（插件把空值解释为无限期）；
 * - 已封禁且有到期时间 → 按当前语言格式化。
 *
 * 过期时间在未来的封禁仍然算封禁中：better-auth 判定 `banned` 时自己会比较
 * `banExpires`，这里只负责展示，不重复做时间判断。
 */
function formatBanExpiry(user: AdminUser): string {
  if (!user.banned) return '—'
  if (!user.banExpires) return m.admin_users_ban_permanent()
  return formatDate(user.banExpires)
}

/**
 * 头像回退字母。
 *
 * 优先取姓名的首字符（中文取第一个汉字、英文取首字母），姓名缺失时退回邮箱首字符。
 * `toUpperCase()` 对中文无副作用，对西文能保证大写，不必按语言分支。
 */
function userInitial(user: AdminUser): string {
  return (user.name?.trim() || user.email).charAt(0).toUpperCase()
}

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
