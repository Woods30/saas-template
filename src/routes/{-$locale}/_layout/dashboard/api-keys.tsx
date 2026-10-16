import { createFileRoute } from '@tanstack/react-router'
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
import { assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/dashboard/api-keys')({
  // 功能开关关闭时整页 404：与菜单项消失同源，路由本身始终保留。
  beforeLoad: () => assertFeatureEnabled('enableApiKeys'),
  head: () => {
    const base = seo('/dashboard/api-keys', {
      title: m.settings_api_keys_title(),
      description: m.settings_api_keys_description(),
      locale: getRequestLocale(),
    })
    return { ...base, meta: [...base.meta, { name: 'robots', content: 'noindex' }] }
  },
  component: ApiKeysPage,
})

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

  // 创建弹窗：输入名称 → 提交；成功后切到「一次性展示」弹窗。
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
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
    const { data, error: createError } = await authClient.apiKey.create({ name: name.trim() })
    setCreating(false)
    if (createError) {
      setError(createError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    // 明文 `key` 只在此刻返回一次；列表接口永远不会再给出它。
    setCreatedKey(data?.key ?? null)
    setCreateOpen(false)
    setName('')
    await load()
  }

  async function onDelete(entry: ApiKeyEntry) {
    const { error: deleteError } = await authClient.apiKey.delete({ keyId: entry.id })
    setPendingDelete(null)
    if (deleteError) {
      setError(deleteError.message?.split('\n')[0] ?? m.settings_error_generic())
      return
    }
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{m.settings_api_keys_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.settings_api_keys_description()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_api_keys_title()}</CardTitle>
          <CardDescription>{m.settings_api_keys_description()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {keys === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.settings_api_keys_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.settings_api_keys_table_name()}</TableHead>
                  <TableHead>{m.settings_api_keys_table_key()}</TableHead>
                  <TableHead>{m.settings_api_keys_table_created_at()}</TableHead>
                  <TableHead>{m.settings_api_keys_table_expires_at()}</TableHead>
                  <TableHead className="text-right">
                    {m.settings_api_keys_table_actions()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((entry) => (
                  <TableRow key={entry.id}>
                    {/* 名称由用户输入，React 默认转义，无需手工处理。 */}
                    <TableCell>{entry.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{maskKey(entry)}</TableCell>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    <TableCell>
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

          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            {m.settings_api_keys_create()}
          </Button>
        </CardContent>
      </Card>

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
