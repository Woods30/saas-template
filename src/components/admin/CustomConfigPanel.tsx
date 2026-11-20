import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
import { fetchCustomSettings, saveCustomSettings } from '@/core/config/admin'
import { type CustomSetting, isValidCustomKey } from '@/core/config/custom'
import { m } from '@/locale/paraglide/messages.js'

/** 表格行：服务端数据加一个本地 uid，作为 React key（键可被编辑，不能当 key）。 */
interface EditableRow extends CustomSetting {
  uid: string
  /** 密钥是否已配置；掩码本身不进输入框，只用它决定 placeholder。 */
  configured: boolean
}

let nextRowUid = 0

function toEditableRow(entry: CustomSetting): EditableRow {
  nextRowUid += 1
  return {
    ...entry,
    // 密钥值不回显：掩码一旦成为输入框的 value，新输入会追加在掩码后面，
    // 提交时又被当成「没改」，新密钥就被静默丢弃。空值表示保持原值。
    value: entry.secret ? '' : entry.value,
    configured: entry.secret && entry.value !== '',
    // 新增行没有旧键；已加载的行记住原键，改名后仍能找回原密文。
    originalKey: entry.key === '' ? undefined : entry.key,
    uid: `custom-row-${nextRowUid}`,
  }
}

/**
 * 自定义键值配置面板。
 *
 * 注册表之外的设置按 `custom.<key>` 存储。面板自己拉取、自己保存（整表替换），
 * 不复用系统设置页的按 tab 保存。密钥值留空或保持掩码表示不修改。
 */
export function CustomConfigPanel() {
  const [rows, setRows] = useState<EditableRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * 最近一次拉取的序号。
   *
   * TanStack Start 的客户端入口包了 `StrictMode`，开发模式下 effect 会执行两次，
   * 两个 `fetchCustomSettings()` 并发返回；先返回的那个已把面板渲染成可编辑状态，
   * 用户新增行之后，迟到的旧响应再把 `rows` 整体覆盖，刚输入的行就静默丢了。
   * 只接受最新一次请求的结果，旧响应直接丢弃。
   */
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const entries = await fetchCustomSettings()
      if (seq !== loadSeq.current) return
      setRows(entries.map(toEditableRow))
      setError(null)
    } catch {
      if (seq !== loadSeq.current) return
      setError(m.settings_error_generic())
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateRow(index: number, patch: Partial<CustomSetting>) {
    setRows((prev) => prev?.map((row, i) => (i === index ? { ...row, ...patch } : row)) ?? prev)
  }

  function removeRow(index: number) {
    setRows((prev) => prev?.filter((_, i) => i !== index) ?? prev)
  }

  function addRow() {
    setRows((prev) => [...(prev ?? []), toEditableRow({ key: '', value: '', secret: false })])
  }

  function toggleSecret(index: number, checked: boolean) {
    setRows(
      (prev) =>
        prev?.map((row, i) => {
          if (i !== index) return row
          // 掩码从未进入输入框，切回普通值时不需要额外清理；切到密钥时保留已输入
          // 的值（用户可能正想把它改存为密钥）。切回普通值后不再是「已配置密钥」。
          return { ...row, secret: checked, configured: checked ? row.configured : false }
        }) ?? prev,
    )
  }

  async function save() {
    if (!rows) return

    const keys = new Set<string>()
    for (const row of rows) {
      if (!isValidCustomKey(row.key)) {
        toast.add({ type: 'error', title: m.admin_settings_custom_invalid_key() })
        return
      }
      if (keys.has(row.key)) {
        toast.add({ type: 'error', title: m.admin_settings_custom_duplicate_key() })
        return
      }
      keys.add(row.key)
    }

    setSaving(true)
    try {
      await saveCustomSettings({
        data: {
          entries: rows.map((row) => ({
            key: row.key,
            value: row.value,
            secret: row.secret,
            originalKey: row.originalKey,
          })),
        },
      })
      await load()
      toast.add({ type: 'success', title: m.admin_settings_saved() })
    } catch {
      toast.add({ type: 'error', title: m.admin_settings_save_failed() })
    } finally {
      setSaving(false)
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {error ? <p role="alert">{error}</p> : <Spinner />}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.admin_settings_custom_title()}</CardTitle>
        <CardDescription>{m.admin_settings_custom_description()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.admin_settings_custom_empty()}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.admin_settings_custom_key()}</TableHead>
                <TableHead>{m.admin_settings_custom_value()}</TableHead>
                <TableHead>{m.admin_settings_custom_secret()}</TableHead>
                <TableHead className="text-right">{m.admin_settings_custom_remove()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.uid}>
                  <TableCell>
                    <Input
                      value={row.key}
                      aria-label={`${m.admin_settings_custom_key()} ${index + 1}`}
                      onChange={(event) => updateRow(index, { key: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.value}
                      aria-label={`${m.admin_settings_custom_value()} ${index + 1}`}
                      placeholder={
                        row.secret
                          ? row.configured
                            ? m.admin_settings_secret_configured()
                            : m.admin_settings_secret_unset()
                          : undefined
                      }
                      onChange={(event) => updateRow(index, { value: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.secret}
                      aria-label={`${m.admin_settings_custom_secret()} ${index + 1}`}
                      onCheckedChange={(checked) => toggleSecret(index, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(index)}
                    >
                      {m.admin_settings_custom_remove()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={addRow}>
            {m.admin_settings_custom_add()}
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? m.admin_settings_saving() : m.admin_settings_save()}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">{m.admin_settings_custom_secret_hint()}</p>
      </CardContent>
    </Card>
  )
}
