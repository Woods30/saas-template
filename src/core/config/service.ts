/**
 * 站点配置服务（服务端专用）。
 *
 * 数据流：
 * - 数据库 `settings` 表存六个分组的 JSON；
 * - 读出来与代码默认值合并，装进 `setResolvedConfig`——全站读到的就是它；
 * - 进程内缓存 30 秒，后台保存后立即失效（不等 TTL）。
 *
 * 「装进全局」而不是每次调用现查：门禁、SEO、页脚这些地方是**同步**读配置的，
 * 让它们 await 数据库会把整条渲染链变成异步。缓存 + 30 秒 TTL 换来的代价是
 * 「改完最多 30 秒全站生效」，后台保存这条路径则是即时的。
 */
import {
  baseConfig,
  getResolvedConfig,
  setResolvedConfig,
  type WebsiteConfig,
} from '@/config/website'
import { type DB, schema } from '@/core/db'
import {
  applySettingsToConfig,
  defaultSettings,
  mergeSettings,
  type SettingsGroups,
  type SettingsKey,
  settingsSchemas,
} from './settings'

/** 进程内缓存有效期。 */
export const SETTINGS_CACHE_TTL_MS = 30_000

interface SettingsCache {
  settings: SettingsGroups
  loadedAt: number
  /** 每次写入 +1，供下游缓存判断是否过期。 */
  version: number
}

let cache: SettingsCache | undefined

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

/** 当前生效的配置分组。 */
export function getSettingsSnapshot(): SettingsGroups {
  return cache?.settings ?? defaultSettings()
}

/** 配置版本号。 */
export function getSettingsVersion(): number {
  return cache?.version ?? 0
}

/** JSON 解析失败返回 undefined：坏数据只丢该分组，不让整站配置崩掉。 */
function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** 把合并后的分组摊回「存储形状」，便于再次合并。 */
function toStored(settings: SettingsGroups): Record<SettingsKey, unknown> {
  return {
    brand: settings.brand,
    seo: settings.seo,
    social: settings.social,
    payment: settings.payment,
    mail: settings.mail,
    modules: settings.modules,
  }
}

/** 把当前快照装进全局配置。 */
function install(settings: SettingsGroups): void {
  setResolvedConfig(applySettingsToConfig(baseConfig, settings))
}

/**
 * 读数据库里的全部分组。
 *
 * 表不存在（老库没跑迁移）时抛错由调用方兜底——站点仍应能起站，只是后台
 * 改的配置不生效。
 */
export async function readSettings(db: DB): Promise<SettingsGroups> {
  const rows = await db.select().from(schema.settings)
  const stored: Partial<Record<SettingsKey, unknown>> = {}
  for (const row of rows) {
    const parsed = parseJson(row.value)
    if (parsed !== undefined) {
      stored[row.key as SettingsKey] = parsed
    }
  }
  return mergeSettings(defaultSettings(), stored)
}

/**
 * 刷新配置。TTL 内直接用缓存。
 *
 * 读库失败时不抛：配置读不到不该让整个请求失败，退回出厂配置继续服务。
 */
export async function loadSettings(db: DB, now: number = Date.now()): Promise<SettingsGroups> {
  if (settingsCacheFresh(now)) {
    return getSettingsSnapshot()
  }
  let settings: SettingsGroups
  try {
    settings = await readSettings(db)
  } catch (error) {
    console.warn('[config] 读取配置失败，使用出厂配置：', error)
    settings = defaultSettings()
  }
  cache = { settings, loadedAt: now, version: cache?.version ?? 0 }
  install(settings)
  return settings
}

/**
 * 写一组配置并立即生效。
 *
 * 值先过 zod：后台传进来的东西必须合法，非法直接抛错，不落库。
 */
export async function saveSettings(
  db: DB,
  key: SettingsKey,
  value: unknown,
): Promise<SettingsGroups> {
  const parsed = settingsSchemas[key].parse(value)
  const json = JSON.stringify(parsed)
  const updatedAt = new Date()
  await db
    .insert(schema.settings)
    .values({ key, value: json, updatedAt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: json, updatedAt },
    })
  const merged = mergeSettings(defaultSettings(), {
    ...toStored(getSettingsSnapshot()),
    [key]: parsed,
  })
  cache = { settings: merged, loadedAt: Date.now(), version: getSettingsVersion() + 1 }
  install(merged)
  return merged
}

/** 当前生效的站点配置：与全站读 `websiteConfig` 拿到的是同一份。 */
export function currentConfig(): WebsiteConfig {
  return getResolvedConfig()
}
