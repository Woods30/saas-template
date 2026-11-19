import { IconChevronRight } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CustomConfigPanel } from '@/components/admin/CustomConfigPanel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
 * 页面不用跟着改。
 *
 * 交互契约：
 * - 左侧（窄屏顶部）是 tab 导航，切换 tab 只显示该 tab 的分组；
 * - 草稿按 tab 保存，切走再切回来不丢未保存的输入；重新拉取后回到服务端值；
 * - 每个 tab 顶部只有一个保存按钮，提交该 tab 所有分组的字段——收起的分组也算；
 * - 每个分组是可折叠卡片，默认展开；密钥输入框不回显掩码，留空表示不修改，
 *   是否已配置用 placeholder 表达。
 */
export const Route = createFileRoute('/{-$locale}/_layout/admin/settings')({
  head: () => adminHead(adminRoutes.settings),
  component: AdminSettingsPage,
})

/** 草稿：键是字段键；`json` 与 `list` 在编辑期是字符串，保存时才转回结构。 */
type Draft = Record<string, unknown>

/** 某个 tab 的初始草稿：只取该 tab 的字段，避免把别的 tab 的值混进来。 */
function seedDraft(tab: SettingTab, values: AdminSettingsValues): Draft {
  const draft: Draft = {}
  for (const group of tab.groups) {
    for (const field of group.fields) {
      // 密钥字段的草稿一律留空：服务端只回显掩码，把掩码填进输入框会让新输入
      // 追加在掩码后面，提交时又被当成「没改」而静默丢弃。是否已配置由
      // placeholder 表达，空值表示保持原值。
      draft[field.key] = field.secret ? '' : values[field.key]
    }
  }
  return draft
}

/** 输入控件：按字段类型分派，避免每个字段写一遍表单。 */
function SettingInput({
  field,
  value,
  placeholder,
  onChange,
}: {
  field: SettingField
  value: unknown
  /** 仅密钥字段使用：值不在输入框里回显，用占位文案表达是否已配置。 */
  placeholder?: string
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

  if (field.kind === 'textarea') {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        <Textarea id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
      </Field>
    )
  }

  if (field.kind === 'json') {
    // 服务端值是已解析的结构（数组 / 对象），草稿里可能是管理员改过的文本。
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label()}</FieldLabel>
        <Textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} />
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
        placeholder={placeholder}
        onChange={(e) =>
          onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
      {field.hint && <FieldDescription>{field.hint()}</FieldDescription>}
    </Field>
  )
}

/** 可折叠的分组卡片：标题、说明、字段与可选的「测试连接」都在卡片内。 */
function SettingGroupCard({
  group,
  draft,
  values,
  onChange,
}: {
  group: SettingGroup
  draft: Draft
  /** 服务端值：密钥字段只在这里有掩码，用来判断「是否已配置」。 */
  values: AdminSettingsValues
  onChange: (key: string, next: unknown) => void
}) {
  const [open, setOpen] = useState(true)
  const [testing, setTesting] = useState(false)

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
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            <CardTitle>{group.title()}</CardTitle>
            <IconChevronRight
              aria-hidden
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                open ? 'rotate-90' : ''
              }`}
            />
          </CollapsibleTrigger>
          {group.description && <CardDescription>{group.description()}</CardDescription>}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {group.fields.map((field) => (
              <SettingInput
                key={field.key}
                field={field}
                value={draft[field.key]}
                placeholder={
                  field.secret
                    ? values[field.key] === '' || values[field.key] === undefined
                      ? m.admin_settings_secret_unset()
                      : m.admin_settings_secret_configured()
                    : undefined
                }
                onChange={(next) => onChange(field.key, next)}
              />
            ))}
          </CardContent>
          {group.test && (
            <CardFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={testing}
                onClick={() => void test()}
              >
                {testing ? m.admin_settings_testing() : m.admin_settings_test_connection()}
              </Button>
            </CardFooter>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/**
 * 把一个 tab 的草稿转成提交载荷。
 *
 * 遍历注册表里的全部字段而非当前挂载的输入框：分组收起后字段卸载，但值仍在草稿里。
 * 返回 `null` 表示 JSON 解析失败（错误已提示），调用方不再提交。
 */
function buildPayload(
  tab: SettingTab,
  draft: Draft,
  values: AdminSettingsValues,
): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {}

  for (const group of tab.groups) {
    for (const field of group.fields) {
      const value = draft[field.key]
      // 密钥：草稿从空值起步，仍是空值表示没改，不提交（服务端保持原值）。
      // 旧客户端回传掩码时也按「没改」处理。
      if (field.secret && (value === '' || value === values[field.key])) continue
      if (field.kind === 'list') {
        payload[field.key] =
          typeof value === 'string'
            ? value
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item !== '')
            : (value ?? [])
      } else if (field.kind === 'json') {
        // 没编辑过时草稿仍是服务端结构；只有字符串才需要解析。
        try {
          payload[field.key] = typeof value === 'string' ? JSON.parse(value) : (value ?? [])
        } catch {
          toast.add({ type: 'error', title: m.admin_settings_json_invalid() })
          return null
        }
      } else {
        payload[field.key] = value
      }
    }
  }

  return payload
}

function AdminSettingsPage() {
  const [values, setValues] = useState<AdminSettingsValues | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>(SETTING_TABS[0]?.id ?? 'general')
  const [saving, setSaving] = useState(false)

  /**
   * 服务端值到达时同步页面状态。
   *
   * 首次加载（`savedTab` 缺省）重置所有 tab 的草稿；保存成功后只重置被保存的
   * tab，其它 tab 的未保存草稿继续保留。
   */
  const applyValues = useCallback((next: AdminSettingsValues, savedTab?: SettingTab) => {
    setValues(next)
    if (savedTab) {
      setDrafts((prev) => ({ ...prev, [savedTab.id]: seedDraft(savedTab, next) }))
      return
    }
    setDrafts(Object.fromEntries(SETTING_TABS.map((tab) => [tab.id, seedDraft(tab, next)])))
  }, [])

  const load = useCallback(async () => {
    try {
      applyValues(await fetchAdminSettings())
      setError(null)
    } catch {
      setError(m.settings_error_generic())
    }
  }, [applyValues])

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
  const draft = current ? (drafts[current.id] ?? {}) : {}

  function setField(key: string, next: unknown) {
    if (!current) return
    setDrafts((prev) => ({
      ...prev,
      [current.id]: { ...(prev[current.id] ?? {}), [key]: next },
    }))
  }

  async function saveTab(tab: SettingTab) {
    if (!values) return
    const payload = buildPayload(tab, drafts[tab.id] ?? {}, values)
    if (payload === null) return

    setSaving(true)
    try {
      await saveAdminSettings({ data: { tabId: tab.id, values: payload } })
      applyValues(await fetchAdminSettings(), tab)
      toast.add({ type: 'success', title: m.admin_settings_saved() })
    } catch {
      toast.add({ type: 'error', title: m.admin_settings_save_failed() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        orientation="vertical"
        className="flex-col gap-6 lg:flex-row lg:items-start"
      >
        <TabsList
          variant="line"
          aria-label={m.admin_settings_title()}
          className="w-full justify-start overflow-x-auto rounded-none p-0 max-lg:flex-row! lg:sticky lg:top-6 lg:w-48 lg:shrink-0 lg:flex-col lg:overflow-visible"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-none px-3 py-2 max-lg:w-auto! max-lg:flex-none! max-lg:justify-center! lg:w-full lg:flex-1 lg:justify-start"
            >
              {tab.label()}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="min-w-0 space-y-6">
            {tab.id === 'custom' ? (
              <CustomConfigPanel />
            ) : (
              <>
                <div className="flex justify-end">
                  <Button type="button" disabled={saving} onClick={() => void saveTab(tab)}>
                    {saving ? m.admin_settings_saving() : m.admin_settings_save()}
                  </Button>
                </div>
                {tab.groups.map((group) => (
                  <SettingGroupCard
                    key={group.id}
                    group={group}
                    draft={draft}
                    values={values}
                    onChange={setField}
                  />
                ))}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
