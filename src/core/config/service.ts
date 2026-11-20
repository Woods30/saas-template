/**
 * 站点配置服务（服务端专用）。
 *
 * 数据流：
 * - `settings` 表一个字段一行（值是 JSON；密钥是 `enc:v1:` 密文）；
 * - 读出来逐字段校验、补齐默认值，装进 `setResolvedConfig`——全站读到的就是它；
 * - 同一份值同时翻译成 `ServerEnv` 形状，供支付 / 邮件 / 通知等消费方使用；
 * - 进程内缓存 30 秒，后台保存后立即失效（不等 TTL）。
 *
 * 「装进全局」而不是每次调用现查：门禁、SEO、页脚这些地方是**同步**读配置的，
 * 让它们 await 数据库会把整条渲染链变成异步。
 */
import {
  baseConfig,
  getResolvedConfig,
  setResolvedConfig,
  type WebsiteConfig,
} from '@/config/website'
import { socialProviderOptions } from '@/core/auth/social-providers'
import { type DB, schema } from '@/core/db'
import { parseServerEnv, type RuntimeEnv, type ServerEnv } from '@/core/env/server'
import { decryptSecret, encryptSecret, isEncrypted, MissingEncryptionKeyError } from './crypto'
import { settingsToServerEnv } from './derive'
import { defaultSettingsValues, SETTING_FIELDS, type SettingTabId, settingField } from './registry'
import {
  applySettingsToConfig,
  resolveSettingsValues,
  SettingsValidationError,
  type SettingsValues,
  validateGroupValues,
  validateTabValues,
} from './settings'

/** 进程内缓存有效期。 */
export const SETTINGS_CACHE_TTL_MS = 30_000

interface SettingsCache {
  values: SettingsValues
  serverEnv: RuntimeEnv
  loadedAt: number
  /** 每次写入 +1，供下游缓存判断是否过期。 */
  version: number
}

let cache: SettingsCache | undefined

export interface SettingsLoadOptions {
  now?: number
  /** 部署环境解析出的 `ServerEnv`，提供未纳入配置表的键。 */
  baseEnv?: ServerEnv
  /** 密钥解密口令；缺省时密文字段回落默认值。 */
  encryptionKey?: string
}

/** 缓存是否仍然新鲜。 */
export function settingsCacheFresh(now: number = Date.now()): boolean {
  return cache !== undefined && now - cache.loadedAt < SETTINGS_CACHE_TTL_MS
}

/**
 * 清空进程内缓存。
 *
 * 用于测试与「配置刚被别处改过、必须立刻重读」的场景（如部署后首次请求）。
 */
export function resetSettingsCache(): void {
  cache = undefined
}

/** 当前生效的配置值（扁平，键见 `registry.ts`）。 */
export function getSettingsSnapshot(): SettingsValues {
  return cache?.values ?? defaultSettingsValues()
}

/** 配置版本号。 */
export function getSettingsVersion(): number {
  return cache?.version ?? 0
}

/**
 * 当前生效的 `ServerEnv` 形状配置。
 *
 * 缓存尚未装上时用出厂值推导——调用方总是拿到完整形状，不用判空。
 */
export function getRuntimeServerEnv(base: ServerEnv = parseServerEnv({})): RuntimeEnv {
  return cache?.serverEnv ?? settingsToServerEnv(defaultSettingsValues(), base)
}

/** JSON 解析失败返回 undefined：坏值只丢该字段，不让整站配置崩掉。 */
function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * 读数据库里的全部配置值。
 *
 * 密钥字段在读取时就解密：下游（provider 注册、后台回显）拿到的是明文。
 * 解密失败的字段按「未设置」处理并回落默认值——口令换了或丢了，凭据不可用是
 * 预期行为，不该让整个请求失败。
 */
export async function readSettings(db: DB, encryptionKey?: string): Promise<SettingsValues> {
  const rows = await db.select().from(schema.settings)
  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    const field = settingField(row.key)
    if (!field) continue
    const parsed = parseJson(row.value)
    if (parsed === undefined) continue
    if (field.secret && typeof parsed === 'string' && isEncrypted(parsed)) {
      try {
        stored[row.key] = await decryptSecret(parsed, encryptionKey)
      } catch {
        console.warn(`[config] 配置 ${row.key} 解密失败，已回落默认值`)
      }
      continue
    }
    stored[row.key] = parsed
  }
  return resolveSettingsValues(stored)
}

/** 把当前快照装进全局配置。 */
function install(values: SettingsValues): void {
  setResolvedConfig(applySettingsToConfig(baseConfig, values))
}

/**
 * 刷新配置。TTL 内直接用缓存。
 *
 * 读库失败时不抛：配置读不到不该让整个请求失败，退回出厂配置继续服务。
 */
export async function loadSettings(
  db: DB,
  options: SettingsLoadOptions = {},
): Promise<SettingsValues> {
  const now = options.now ?? Date.now()
  if (settingsCacheFresh(now)) {
    return getSettingsSnapshot()
  }
  const baseEnv = options.baseEnv ?? parseServerEnv({})
  let values: SettingsValues
  try {
    values = await readSettings(db, options.encryptionKey)
  } catch (error) {
    console.warn('[config] 读取配置失败，使用出厂配置：', error)
    values = defaultSettingsValues()
  }
  cache = {
    values,
    serverEnv: settingsToServerEnv(values, baseEnv),
    loadedAt: now,
    version: cache?.version ?? 0,
  }
  install(values)
  return values
}

/** 提交里有没有需要新写入的明文密钥；有则必须提供加密口令。 */
function assertCanWriteSecrets(validated: SettingsValues, options: SettingsLoadOptions): void {
  const hasNewSecret = Object.entries(validated).some(
    ([key, value]) => settingField(key)?.secret === true && value !== '',
  )
  if (hasNewSecret && !options.encryptionKey) {
    throw new MissingEncryptionKeyError()
  }
}

/**
 * 落库并刷新进程内快照（只刷新一次）。
 *
 * 调用方必须已经完成校验。按字段 upsert，密钥加密；留空的密钥视为「保持原值」。
 * 快照用「当前值 + 本次提交」重算，不走数据库，避免刚写入的密文又被读一遍。
 */
async function persistSettingsValues(
  db: DB,
  validated: SettingsValues,
  options: SettingsLoadOptions,
): Promise<SettingsValues> {
  const rows: Array<{ key: string; value: string; updatedAt: Date }> = []
  const updatedAt = new Date()
  for (const [key, value] of Object.entries(validated)) {
    const field = settingField(key)
    if (!field) continue
    let stored = value
    if (field.secret) {
      if (value === '') continue // 空值表示保持原值
      stored = await encryptSecret(String(value), options.encryptionKey)
    }
    rows.push({ key, value: JSON.stringify(stored), updatedAt })
  }

  for (const row of rows) {
    await db
      .insert(schema.settings)
      .values(row)
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: row.value, updatedAt } })
  }

  const merged = { ...getSettingsSnapshot() }
  for (const [key, value] of Object.entries(validated)) {
    const field = settingField(key)
    if (!field) continue
    if (field.secret && value === '') continue
    merged[key] = value
  }
  const baseEnv = options.baseEnv ?? parseServerEnv({})
  cache = {
    values: merged,
    serverEnv: settingsToServerEnv(merged, baseEnv),
    loadedAt: Date.now(),
    version: getSettingsVersion() + 1,
  }
  install(merged)
  return merged
}

/**
 * 写一组配置并立即生效。
 *
 * 保存是**按组**的：一次提交一张卡片。值先过注册表校验，非法直接抛错、不落库。
 * 含密钥的提交要求提供 `CONFIG_ENCRYPTION_KEY` 与**明文**值；留空的密钥表示
 * 「保持原值」，不会被清空——后台回显是掩码，用户没改动时不该把密文覆盖成空。
 */
export async function saveSettingsGroup(
  db: DB,
  groupId: string,
  input: Record<string, unknown>,
  options: SettingsLoadOptions = {},
): Promise<SettingsValues> {
  const validated = validateGroupValues(groupId, input)
  assertCanWriteSecrets(validated, options)
  return persistSettingsValues(db, validated, options)
}

/**
 * 写一个 tab 下的配置并立即生效。
 *
 * 一次提交一个分区，可跨该分区的多个分组；语义与按组保存一致：缺省的键跳过、
 * tab 外的键忽略、任一字段非法则整 tab 不落库。落库与缓存刷新只做一次。
 */
export async function saveSettingsTab(
  db: DB,
  tabId: SettingTabId,
  input: Record<string, unknown>,
  options: SettingsLoadOptions = {},
): Promise<SettingsValues> {
  const validated = validateTabValues(tabId, input)
  if (tabId === 'auth') assertAtLeastOneAuthMethod(validated, options)
  assertCanWriteSecrets(validated, options)
  return persistSettingsValues(db, validated, options)
}

/**
 * 认证 tab 必须至少保留一种**可用**的登录方式。
 *
 * 不能放进 `validateTabValues`：它只看本次提交的键，单独提交
 * `auth.emailEnabled: false` 时看不到另外两个开关。这里把提交值合到当前快照上
 * 再判，得到的才是保存后的真实状态。
 *
 * 「可用」与登录页同源：社交登录要求开关打开**且**两个凭据齐备
 * （`socialProviderOptions`）。只看开关会出现「GitHub 开着但没填凭据、邮箱又关了」
 * 的提交通过，而三种方法实际都不可用，管理员被锁在门外。
 */
function assertAtLeastOneAuthMethod(validated: SettingsValues, options: SettingsLoadOptions): void {
  const prospective = { ...getSettingsSnapshot() }
  for (const [key, value] of Object.entries(validated)) {
    // 空密钥表示保持原值（与 `persistSettingsValues` 一致），不能把凭据判成缺失。
    if (settingField(key)?.secret === true && value === '') continue
    prospective[key] = value
  }
  const env = settingsToServerEnv(prospective, options.baseEnv ?? parseServerEnv({}))
  const providers = socialProviderOptions(applySettingsToConfig(baseConfig, prospective), env)
  const usable =
    prospective['auth.emailEnabled'] === true ||
    providers.google !== undefined ||
    providers.github !== undefined
  if (!usable) throw new SettingsValidationError('auth', '至少保留一种登录方式')
}

/** 当前生效的站点配置：与全站读 `websiteConfig` 拿到的是同一份。 */
export function currentConfig(): WebsiteConfig {
  return getResolvedConfig()
}

/** 字段清单：后台表单按它渲染，保存时也按它校验。 */
export const SETTINGS_FIELDS = SETTING_FIELDS
