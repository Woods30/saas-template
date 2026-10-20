import { IconKey } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
import { assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/api-keys')({
  // 功能开关关闭时整页 404：与菜单项消失同源，路由本身始终保留。
  beforeLoad: () => assertFeatureEnabled('enableApiKeys'),
  head: () =>
    seo('/dashboard/api-keys', {
      title: m.settings_api_keys_title(),
      description: m.settings_api_keys_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: ApiKeysPage,
})

/** `expiresIn` 的单位是**秒**，界面按天选择。 */
const SECONDS_PER_DAY = 86_400

/**
 * 有效期选项（天）。「永不过期」由下面的 `'never'` 单独表示，不放进这个数组。
 *
 * 上限卡在 365 天：插件 `keyExpiration.maxExpiresIn` 默认就是 365，超出会返回
 * `EXPIRES_IN_IS_TOO_LARGE`——把界面上限对齐服务端默认值，用户不会选到一个必然被拒的值。
 */
const EXPIRY_OPTIONS = [30, 90, 365] as const
const DEFAULT_EXPIRY_DAYS = 30

/** 选择器的值；`'never'` 与数字天分开表示，避免用 `0` / `NaN` 当哨兵。 */
type ExpiryChoice = number | 'never'

/** `list` 返回的密钥条目（**不含**明文 `key`，只有 `start` 前几位）。 */
interface ApiKeyEntry {
  id: string
  name?: string | null
  start?: string | null
  prefix?: string | null
  enabled?: boolean | null
  createdAt: Date | string
  expiresAt?: Date | string | null
}

function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 名称过滤：与 admin 用户管理同一套做法——输入即时回显，过滤在渲染时本地生效。
  const [searchValue, setSearchValue] = useState('')

  // 创建弹窗：输入名称 + 选有效期 → 提交；成功后切到「一次性展示」弹窗。
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY_DAYS)
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  // 删除确认：记录待删条目（null 表示无）。
  const [pendingDelete, setPendingDelete] = useState<ApiKeyEntry | null>(null)

  const load = useCallback(async () => {
    const { data, error: listError } = await authClient.apiKey.list()
    if (listError) {
      setError(listError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    setError(null)
    setKeys((data?.apiKeys as ApiKeyEntry[] | undefined) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate() {
    setCreating(true)
    setError(null)
    // `never` 时传 `null`：插件的 `expiresIn` 语义就是「null = 不过期」，
    // 省略字段则会落到 `keyExpiration.defaultExpiresIn`（未配置时同样为 null）。
    const expiresIn = expiry === 'never' ? null : expiry * SECONDS_PER_DAY
    const { data, error: createError } = await authClient.apiKey.create({
      name: name.trim(),
      expiresIn,
    })
    setCreating(false)
    if (createError) {
      setError(createError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    // 明文 `key` 只在此刻返回一次；列表接口永远不会再给出它。
    setCreatedKey(data?.key ?? null)
    setCreateOpen(false)
    setName('')
    setExpiry(DEFAULT_EXPIRY_DAYS)
    await load()
    toast.add({ type: 'success', title: m.settings_api_keys_created_toast() })
  }

  async function onDelete(entry: ApiKeyEntry) {
    const { error: deleteError } = await authClient.apiKey.delete({ keyId: entry.id })
    setPendingDelete(null)
    if (deleteError) {
      setError(deleteError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
    toast.add({ type: 'success', title: m.settings_api_keys_deleted_toast() })
  }

  // 名称过滤：本地过滤（`apiKey.list` 没有查询参数，也没有分页），
  // 空关键词等于不过滤，显示全部。
  const visibleKeys: ApiKeyEntry[] | null = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    if (keys === null) return null
    if (!needle) return keys
    return keys.filter((entry) => (entry.name ?? '').toLowerCase().includes(needle))
  }, [keys, searchValue])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{m.settings_api_keys_title()}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.settings_api_keys_description()}</p>
      </div>

      {/* 表格直接放在内容区，外面不再套 `Card`。

          按 shadcn `dashboard-01` 示例的写法，表格自带外框就够：`Table` 的滚动容器
          （`data-slot="table-container"`）由 globals.css 统一给了边框 + 圆角，
          `TableHeader` 给 `sticky top-0 bg-muted`，页面再套一层 `Card` 就出现
          「框里套框」的双边框——一圈是卡片的，一圈是表格的，两侧间距还不一致。

          同理，工具行（搜索 + 创建按钮）与分页行都贴在表格外侧、用 `flex justify-between`
          与表格共享同一套留白，不另起一张卡。 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={m.settings_api_keys_search_placeholder()}
            aria-label={m.settings_api_keys_search_placeholder()}
            className="max-w-sm flex-1"
          />
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            {m.settings_api_keys_create()}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {visibleKeys === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
          </div>
        ) : visibleKeys.length === 0 ? (
          /* 空态自带主操作：按 shadcn `Empty` 的组合约定，操作按钮放 `EmptyContent`，
             与图标 / 文案一起垂直居中。不要留在 `Empty` 外面——`Empty` 带 `flex-1`，
             外面再放一个按钮会被挤到下一行左侧。 */
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconKey aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{m.settings_api_keys_empty()}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                {m.settings_api_keys_create()}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {/* 窄屏只留「名称 / 密钥 / 操作」，时间列按断点放出；
                    理由同 sessions 页：横向滚动会把「删除」推出可视区。 */}
                <TableHead>{m.settings_api_keys_table_name()}</TableHead>
                <TableHead>{m.settings_api_keys_table_key()}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {m.settings_api_keys_table_created_at()}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {m.settings_api_keys_table_expires_at()}
                </TableHead>
                <TableHead className="text-right">{m.settings_api_keys_table_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleKeys.map((entry) => (
                <TableRow key={entry.id}>
                  {/* 名称由用户输入，React 默认转义，无需手工处理。 */}
                  {/* 密钥用等宽：掩码里的 `••••••` 与前后缀需要字符对齐，这是唯一
                      有语义的等宽场景。字号不缩小，与同行其它单元格保持一致。 */}
                  <TableCell className="w-40 truncate">{entry.name ?? '—'}</TableCell>
                  <TableCell className="font-mono">{maskKey(entry)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatDate(entry.createdAt)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {entry.expiresAt
                      ? formatDate(entry.expiresAt)
                      : m.settings_api_keys_never_expires()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingDelete(entry)}
                    >
                      {m.settings_api_keys_delete()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 创建：输入名称 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_api_keys_create()}</DialogTitle>
            <DialogDescription>{m.settings_api_keys_description()}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="api-key-name">{m.settings_api_keys_name_label()}</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={m.settings_api_keys_name_placeholder()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-expiry">{m.settings_api_keys_expires_label()}</Label>
            {/* 原生 `<select>`：选项是固定 4 项短文案，不需要搜索或分组，
                原生控件在移动端会调起正确的滚轮 / 操作表，且零 JS 即可用。 */}
            <NativeSelect
              id="api-key-expiry"
              value={expiry === 'never' ? 'never' : String(expiry)}
              onChange={(event) =>
                setExpiry(
                  event.target.value === 'never'
                    ? 'never'
                    : Number.parseInt(event.target.value, 10),
                )
              }
            >
              {/* 选项列表在渲染期构造：`m.*()` 调用时才读当前语言，
                  提到模块级会把首次加载的语言固化下来。 */}
              {EXPIRY_OPTIONS.map((days) => (
                <NativeSelectOption key={days} value={String(days)}>
                  {m.settings_api_keys_expires_in_days({ days })}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="never">
                {m.settings_api_keys_never_expires()}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.settings_api_keys_cancel()}
            </DialogClose>
            <Button type="button" disabled={creating || !name.trim()} onClick={onCreate}>
              {m.settings_api_keys_create_submit()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 一次性展示：明文 key 只出现这一次 */}
      <Dialog open={createdKey !== null} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_api_keys_created_title()}</DialogTitle>
            <DialogDescription>{m.settings_api_keys_created_warning()}</DialogDescription>
          </DialogHeader>
          <CopyableKey value={createdKey ?? ''} />
          <DialogFooter>
            <Button type="button" onClick={() => setCreatedKey(null)}>
              {m.settings_api_keys_done()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.settings_api_keys_delete_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.settings_api_keys_delete_confirm_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.settings_api_keys_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && onDelete(pendingDelete)}
              variant="destructive"
            >
              {m.settings_api_keys_delete_confirm_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 明文密钥 + 复制按钮。密钥是敏感值，不写日志、不做持久化。 */
function CopyableKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        }}
      >
        {copied ? m.settings_api_keys_copied() : m.settings_api_keys_copy()}
      </Button>
    </div>
  )
}

/** 列表项只有 `start`（前几位），用它加掩码；缺失时退回 `prefix`。 */
function maskKey(entry: ApiKeyEntry): string {
  const head = entry.start ?? entry.prefix ?? ''
  return `${head}••••••`
}

/** 用当前语言格式化时间；无效值原样返回，不显示 `Invalid Date`。 */
function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}
