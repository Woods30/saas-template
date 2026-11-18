import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminRoutes } from '@/config/routes'
import {
  type AdminSettingsValues,
  fetchAdminSettings,
  saveAdminSettings,
  testAdminConnection,
} from '@/core/config/admin'
import {
  SETTING_TABS,
  type SettingField,
  type SettingGroup,
  type SettingTab,
} from '@/core/config/registry'
import { adminHead } from '@/lib/page-head'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 系统设置页（admin 专用）。
 *
 * 表单由配置注册表生成：新增一个配置项只改 `core/config/registry.ts` 与文案，
 * 页面不用跟着改。保存按卡片（分组）提交，密钥只回显末四位、留空表示不修改。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/settings')({
  head: () => adminHead(adminRoutes.settings),
  component: AdminSettingsPage,
})

/** 草稿：键是字段键；`json` 与 `list` 在编辑期是字符串，保存时才转回结构。 */
type Draft = Record<string, unknown>

function initialDraft(values: AdminSettingsValues): Draft {
  const draft: Draft = {}
  for (const [key, value] of Object.entries(values)) {
    draft[key] = value
  }
  return draft
}

/** 输入控件：按字段类型分派，避免每个字段写一遍表单。 */
function SettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingField
  value: unknown
  onChange: (next: unknown) => void
}) {
  const id = `setting-${field.key.replace(/\./g, '-')}`

  if (field.kind === 'boolean') {
    return (
      <Field orientation="horizontal">
        <Switch id={id} checked={value === true} onCheckedChange={onChange} />
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
      </Field>
    )
  }

  if (field.kind === 'select') {
    const options = field.options ?? []
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        <Select
          value={String(value ?? '')}
          onValueChange={onChange}
          items={options.map((option) => ({ value: option, label: option }))}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
      </Field>
    )
  }

  if (field.kind === 'textarea' || field.kind === 'json') {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        <Textarea id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
      </Field>
    )
  }

  if (field.kind === 'list') {
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} />
        {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
      </Field>
    )
  }

  const inputType =
    field.kind === 'password'
      ? 'password'
      : field.kind === 'email'
        ? 'email'
        : field.kind === 'url'
          ? 'url'
          : field.kind === 'number'
            ? 'number'
            : 'text'

  return (
    <Field>
      <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
      <Input
        id={id}
        type={inputType}
        value={String(value ?? '')}
        onChange={(e) =>
          onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
      {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
    </Field>
  )
}

/** 一组字段的卡片：编辑、保存、可选的测试连接。 */
function SettingGroupCard({
  group,
  values,
  onSaved,
}: {
  group: SettingGroup
  values: AdminSettingsValues
  onSaved: (values: AdminSettingsValues) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(values))
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)

  // 保存成功后父组件刷新了 values：用新值重置草稿。
  useEffect(() => {
    setDraft(initialDraft(values))
  }, [values])

  const set = (key: string, next: unknown) => setDraft((prev) => ({ ...prev, [key]: next }))

  async function save() {
    const payload: Record<string, unknown> = {}
    for (const field of group.fields) {
      const value = draft[field.key]
      // 密钥：与初始掩码相同表示没改，不提交（服务端会保持原值）。
      if (field.secret && value === values[field.key]) continue
      if (field.kind === 'list') {
        payload[field.key] =
          typeof value === 'string'
            ? value
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item !== '')
            : (value ?? [])
      } else if (field.kind === 'json') {
        try {
          payload[field.key] = JSON.parse(String(value ?? '[]'))
        } catch {
          toast.add({ type: 'error', title: m.admin_settings_json_invalid() })
          return
        }
      } else {
        payload[field.key] = value
      }
    }

    setBusy(true)
    try {
      await saveAdminSettings({ data: { groupId: group.id, values: payload } })
      const refreshed = await fetchAdminSettings()
      onSaved(refreshed)
      toast.add({ type: 'success', title: m.admin_settings_saved() })
    } catch {
      toast.add({ type: 'error', title: m.admin_settings_save_failed() })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    if (!group.test) return
    setTesting(true)
    try {
      const result = await testAdminConnection({ data: { target: group.test } })
      toast.add({
        type: result.ok ? 'success' : 'error',
        title: result.ok ? m.admin_settings_test_ok() : m.admin_settings_test_failed(),
        description: result.message,
      })
    } catch {
      toast.add({ type: 'error', title: m.admin_settings_test_failed() })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.title()}</CardTitle>
        {group.description && <CardDescription>{group.description()}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {group.fields.map((field) => (
          <SettingInput
            key={field.key}
            field={field}
            value={draft[field.key]}
            onChange={(next) => set(field.key, next)}
          />
        ))}
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? m.admin_settings_saving() : m.admin_settings_save()}
        </Button>
        {group.test && (
          <Button type="button" variant="outline" disabled={testing} onClick={() => void test()}>
            {testing ? m.admin_settings_testing() : m.admin_settings_test_connection()}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function AdminSettingsPage() {
  const [values, setValues] = useState<AdminSettingsValues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>(SETTING_TABS[0]?.id ?? 'general')

  const load = useCallback(async () => {
    try {
      setValues(await fetchAdminSettings())
      setError(null)
    } catch {
      setError(m.settings_error_generic())
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tabs = useMemo<readonly SettingTab[]>(() => SETTING_TABS, [])

  if (values === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {error ? <p role="alert">{error}</p> : <Spinner />}
      </div>
    )
  }

  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          aria-label={m.admin_settings_title()}
          className="-mx-4 flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4 lg:sticky lg:top-6 lg:mx-0 lg:w-48 lg:flex-col lg:overflow-visible lg:border-b-0 lg:px-0"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:mb-0 lg:rounded-md lg:border-b-0 lg:px-3 lg:text-left ${
                activeTab === tab.id
                  ? 'border-primary text-foreground lg:bg-muted'
                  : 'border-transparent text-muted-foreground hover:text-foreground lg:hover:bg-muted/50'
              }`}
            >
              {tab.label()}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {current?.groups.map((group) => (
            <SettingGroupCard key={group.id} group={group} values={values} onSaved={setValues} />
          ))}
        </div>
      </div>
    </div>
  )
}
