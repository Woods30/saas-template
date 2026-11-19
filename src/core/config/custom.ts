/**
 * 自定义键值配置（`custom.*` 命名空间）。
 *
 * 注册表（`registry.ts`）之外的站点设置按 `custom.<key>` 存在 `settings` 表：
 * `value` 是 `JSON.stringify({ v, s })`，`v` 为明文或 `enc:v1:` 密文，`s` 标记
 * 是否密钥。密钥入库前加密，后台列表只回显掩码；提交空值或掩码表示保持原值。
 *
 * 整表替换：不在提交清单里的 `custom.*` 行会被删除，注册表行不受影响。
 */
import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, like, notInArray } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  MissingEncryptionKeyError,
  maskSecret,
} from './crypto'
import { SETTING_FIELDS } from './registry'
import type { SettingsLoadOptions } from './service'
import { SettingsValidationError } from './settings'

export interface CustomSetting {
  key: string
  value: string
  secret: boolean
}

/** 存储键前缀。 */
const CUSTOM_PREFIX = 'custom.'

/** 自定义键格式：小写字母开头，总长 2–64，只含小写字母、数字、点、下划线与连字符。 */
const CUSTOM_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/

/** 掩码前缀：后台回显的密钥值以它开头，提交回来表示「没改」。 */
const MASK_PREFIX = '••••'

const REGISTRY_KEYS = new Set(SETTING_FIELDS.map((field) => field.key))

/**
 * 保留前缀：注册表字段的顶层段 + `features` + `modules.auth`。
 *
 * `features` 是历史模块开关的命名空间，`modules.auth` 用来拦截整段认证配置；
 * 其余顶层段（`brand` / `seo` / `payment` …）已由字段首段覆盖。
 */
const RESERVED_PREFIXES = new Set<string>([
  ...SETTING_FIELDS.map((field) => field.key.split('.')[0] ?? field.key),
  'features',
  'modules.auth',
])

/** 键是否与注册表或保留前缀冲突。格式合法性由调用方另行校验。 */
export function isReservedCustomKey(key: string): boolean {
  if (REGISTRY_KEYS.has(key)) return true
  for (const prefix of RESERVED_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return true
  }
  return false
}

/** 键是否可以作为自定义键使用：格式、`custom.` 前缀与保留前缀一起判定。 */
export function isValidCustomKey(key: string): boolean {
  return CUSTOM_KEY_PATTERN.test(key) && !key.startsWith(CUSTOM_PREFIX) && !isReservedCustomKey(key)
}

function assertValidEntry(entry: CustomSetting): void {
  if (!CUSTOM_KEY_PATTERN.test(entry.key)) {
    throw new SettingsValidationError(entry.key, '键格式不合法')
  }
  if (entry.key.startsWith(CUSTOM_PREFIX)) {
    throw new SettingsValidationError(entry.key, '键不得以 custom. 开头')
  }
  if (isReservedCustomKey(entry.key)) {
    throw new SettingsValidationError(entry.key, '键与内置配置冲突')
  }
}

interface StoredCustomValue {
  v: string
  s: boolean
}

/** 解析存储值；坏数据按「不存在」处理，不让一行坏值拖垮整个列表。 */
function parseStored(raw: string): StoredCustomValue | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredCustomValue).v === 'string' &&
      typeof (parsed as StoredCustomValue).s === 'boolean'
    ) {
      return { v: (parsed as StoredCustomValue).v, s: (parsed as StoredCustomValue).s }
    }
  } catch {
    // 非法 JSON：忽略该行。
  }
  return undefined
}

/** 读取全部自定义配置；密钥条目只返回掩码。 */
export async function listCustomSettings(db: DB, encryptionKey?: string): Promise<CustomSetting[]> {
  const rows = await db
    .select({ key: schema.settings.key, value: schema.settings.value })
    .from(schema.settings)
    .where(like(schema.settings.key, `${CUSTOM_PREFIX}%`))
    .orderBy(schema.settings.key)

  const entries: CustomSetting[] = []
  for (const row of rows) {
    const stored = parseStored(row.value)
    if (!stored) continue

    const key = row.key.slice(CUSTOM_PREFIX.length)
    if (!stored.s) {
      entries.push({ key, value: stored.v, secret: false })
      continue
    }

    let masked: string
    if (!isEncrypted(stored.v)) {
      masked = maskSecret(stored.v)
    } else {
      try {
        masked = maskSecret(await decryptSecret(stored.v, encryptionKey))
      } catch {
        // 口令缺失或不对时不回显任何明文，也避免把「读不到」误显示成「未设置」。
        masked = '••••••••'
      }
    }
    entries.push({ key, value: masked, secret: true })
  }
  return entries
}

/**
 * 整表替换自定义配置。
 *
 * 先完成全部校验与加密再动数据库：中途失败（例如新增明文密钥但缺
 * `CONFIG_ENCRYPTION_KEY`）不会留下「已删除、未写入」的半截状态。
 */
export async function replaceCustomSettings(
  db: DB,
  entries: CustomSetting[],
  options: SettingsLoadOptions = {},
): Promise<void> {
  const seen = new Set<string>()
  for (const entry of entries) {
    assertValidEntry(entry)
    if (seen.has(entry.key)) {
      throw new SettingsValidationError(entry.key, '键重复')
    }
    seen.add(entry.key)
  }

  const existingRows = await db
    .select({ key: schema.settings.key, value: schema.settings.value })
    .from(schema.settings)
    .where(like(schema.settings.key, `${CUSTOM_PREFIX}%`))

  const existing = new Map<string, StoredCustomValue>()
  for (const row of existingRows) {
    const stored = parseStored(row.value)
    if (stored) existing.set(row.key, stored)
  }

  const updatedAt = new Date()
  const rows: Array<{ key: string; value: string; updatedAt: Date }> = []

  for (const entry of entries) {
    const storageKey = `${CUSTOM_PREFIX}${entry.key}`
    let stored: string

    if (entry.secret) {
      const keepExisting = entry.value === '' || entry.value.startsWith(MASK_PREFIX)
      if (keepExisting) {
        // 掩码或空值表示保持原密文；新键没有原值时就存空字符串。
        const previous = existing.get(storageKey)
        stored = previous?.s === true ? previous.v : ''
      } else {
        if (!options.encryptionKey) throw new MissingEncryptionKeyError()
        stored = await encryptSecret(entry.value, options.encryptionKey)
      }
    } else {
      stored = entry.value
    }

    rows.push({
      key: storageKey,
      value: JSON.stringify({ v: stored, s: entry.secret }),
      updatedAt,
    })
  }

  // 删除不再提交的 custom.* 行；注册表行不匹配 like 条件，不会被碰到。
  const keepKeys = rows.map((row) => row.key)
  const customRows = like(schema.settings.key, `${CUSTOM_PREFIX}%`)
  await db
    .delete(schema.settings)
    .where(
      keepKeys.length === 0
        ? customRows
        : and(customRows, notInArray(schema.settings.key, keepKeys)),
    )

  for (const row of rows) {
    await db
      .insert(schema.settings)
      .values(row)
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: row.value, updatedAt: row.updatedAt },
      })
  }
}

/**
 * 按自定义键读取一个值（服务端内部使用）。
 *
 * 键不存在时返回 `undefined`；密钥条目解密后返回明文。读库与 env 都走动态
 * import，避免把 Node 内置模块带进客户端图。
 */
export const getCustomSetting = createServerOnlyFn(
  async (key: string): Promise<unknown | undefined> => {
    const [{ getServerContext }, { createDbFromEnv }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/core/db'),
    ])
    const env = getServerContext().env
    const db = await createDbFromEnv(env)
    const rows = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, `${CUSTOM_PREFIX}${key}`))
      .limit(1)

    const row = rows[0]
    if (!row) return undefined
    const stored = parseStored(row.value)
    if (!stored) return undefined
    if (stored.s && isEncrypted(stored.v)) {
      return decryptSecret(stored.v, env.CONFIG_ENCRYPTION_KEY)
    }
    return stored.v
  },
)
