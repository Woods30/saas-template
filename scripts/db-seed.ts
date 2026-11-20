/**
 * 写入种子数据。
 *
 * 用法：
 * - `pnpm db:seed`         本地 D1
 * - `pnpm db:seed:remote`  远端 D1
 * - `pnpm db:seed:pg`      PostgreSQL（读 `DATABASE_URL`）
 * - `--brand <名>`         把品牌名换成自己的（替代已废弃的 `pnpm run init --name`）
 * - `--email <地址>`       把支持邮箱换成自己的
 * - `--force`              覆盖已有值（默认只补缺失的，不动后台改过的配置）
 *
 * 种子内容：站点配置的逐字段默认值（env 只在这里作初值来源）、RBAC 权限点与分类。
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseManualPaymentAccounts } from '../src/config/website'
import {
  type BuiltinRoleSeed,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  type PermissionSeed,
  permissionIdOf,
  roleIdOf,
} from '../src/core/auth/rbac'
import { defaultSettingsValues, SETTING_FIELDS } from '../src/core/config/registry'
import type { SettingsValues } from '../src/core/config/settings'
import {
  type DatabaseProvider,
  type Dialect,
  dialectOf,
  resolveDatabaseProvider,
} from '../src/core/db/provider'
import {
  DEFAULT_TAXONOMIES,
  type TaxonomySeed,
  taxonomyIdOf,
} from '../src/modules/taxonomy/catalog'

/** 命令行覆盖项：把出厂值换成使用者的。 */
export interface SeedOverrides {
  brandName?: string
  brandTagline?: string
  supportEmail?: string
}

/**
 * 解析覆盖项。
 *
 * 只认三个带值的参数，其余参数（`--local` / `--remote` / `--pg` / `--force`）
 * 由调用方处理。
 */
export function parseSeedOverrides(argv: string[]): SeedOverrides {
  const overrides: SeedOverrides = {}
  const flags: Array<[string, keyof SeedOverrides]> = [
    ['--brand', 'brandName'],
    ['--tagline', 'brandTagline'],
    ['--email', 'supportEmail'],
  ]

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) continue
    const match = flags.find(([name]) => name === arg)
    if (!match) continue
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`${match[0]} 缺少取值`)
    overrides[match[1]] = value
    index++
  }
  return overrides
}

/**
 * 初值：注册表默认值 + 部署环境里的旧变量 + 命令行覆盖。
 *
 * env 只在 seed 时作为初值来源：运行期只读数据库。键名映射写在注册表的 `envKey`
 * 上，这里不额外维护一份清单。
 */
export function seedValues(
  env: Record<string, string | undefined>,
  overrides: SeedOverrides,
): SettingsValues {
  const values = defaultSettingsValues()
  for (const field of SETTING_FIELDS) {
    if (!field.envKey) continue
    const raw = env[field.envKey]
    if (raw === undefined || raw === '') continue
    if (field.kind === 'boolean') values[field.key] = raw === 'true'
    else if (field.kind === 'list') {
      values[field.key] = raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    } else if (field.kind === 'json') {
      values[field.key] = parseManualPaymentAccounts(raw) ?? values[field.key]
    } else if (field.kind === 'number') {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) values[field.key] = parsed
    } else values[field.key] = raw
  }
  // 旧写法的兼容键：新名未给时回退。
  if (!env.VITE_UMAMI_WEBSITE_ID && env.VITE_UMAMI_ID) {
    values['analytics.umamiWebsiteId'] = env.VITE_UMAMI_ID
  }
  if (!env.VITE_CLARITY_PROJECT_ID && env.VITE_CLARITY_ID) {
    values['analytics.clarityProjectId'] = env.VITE_CLARITY_ID
  }
  return applySeedOverrides(values, overrides)
}

/** 把覆盖项落到配置上；未覆盖的字段保持出厂值。 */
export function applySeedOverrides(
  values: SettingsValues,
  overrides: SeedOverrides,
): SettingsValues {
  const next = { ...values }
  if (overrides.brandName !== undefined) next['brand.name'] = overrides.brandName
  if (overrides.brandTagline !== undefined) next['brand.tagline'] = overrides.brandTagline
  if (overrides.supportEmail !== undefined) next['mail.supportEmail'] = overrides.supportEmail
  return next
}

/** SQL 字符串字面量转义。 */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** 可空字符串：null 写成 SQL 的 NULL。 */
function sqlNullableString(value: string | null): string {
  return value === null ? 'NULL' : sqlString(value)
}

/**
 * 生成种子 SQL。
 *
 * 逐字段插入一行；**先清掉注册表之外的旧键**——早期版本把整组 JSON 存在
 * `brand` / `seo` 这类键下，留着它们会让「哪份生效」再次变得含糊。
 *
 * 默认只补缺失的（`DO NOTHING`）：种子是「让站点能跑起来」，不是「把后台改过的
 * 配置冲掉」。要覆盖用 `--force`。
 *
 * 时间戳表达式随方言走：SQLite 系用 `strftime('%s','now')`（列是整数秒），
 * PostgreSQL 用 `now()`（列是 timestamptz）。
 */
export function buildSeedSql(values: SettingsValues, force: boolean, dialect: Dialect): string {
  const now = dialect === 'postgresql' ? 'now()' : "strftime('%s','now')"
  const conflict = force
    ? `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = ${now}`
    : 'ON CONFLICT (key) DO NOTHING'
  const knownKeys = SETTING_FIELDS.map((field) => sqlString(field.key)).join(', ')
  // `custom.*` 是后台「自定义配置」tab 写入的键，不在注册表里；用 NOT LIKE 排除，
  // 否则一次 `db:seed` 会把用户自定义配置全删。`_` 在 LIKE 里是单字符通配符，但
  // 这里的模式只有 `custom.%`（点号是字面量），无需 ESCAPE：`custom_foo` 不会匹配
  // `custom.%`，只有 `custom.` 前缀的行被保留。
  const cleanup = `DELETE FROM settings WHERE key NOT IN (${knownKeys}) AND key NOT LIKE 'custom.%';`
  const lines = Object.entries(values).map(
    ([key, value]) =>
      `INSERT INTO settings (key, value, updated_at) VALUES (${sqlString(key)}, ${sqlString(
        JSON.stringify(value),
      )}, ${now}) ${conflict};`,
  )
  return `${cleanup}\n${lines.join('\n')}\n`
}

/**
 * 生成 RBAC 权限点与内置角色的种子 SQL。
 */
export function buildRbacSeedSql(force: boolean, dialect: Dialect): string {
  const now = dialect === 'postgresql' ? 'now()' : "strftime('%s','now')"
  const lines: string[] = []

  for (const perm of DEFAULT_PERMISSIONS) {
    lines.push(permissionSql(perm, now))
  }
  for (const role of DEFAULT_ROLES) {
    lines.push(roleSql(role, force, now))
  }
  for (const role of DEFAULT_ROLES) {
    for (const code of role.permissions) {
      lines.push(rolePermissionSql(role, code, now))
    }
  }

  return `${lines.join('\n')}\n`
}

/**
 * 权限点是**目录数据**，不是用户数据：老库升级后必须补出新增的权限码，
 * 否则新代码引用的权限点永远不存在。因此无论 `--force` 与否都 upsert。
 * `roles` / `settings` 仍保持「默认不覆盖」的语义。
 */
function permissionSql(perm: PermissionSeed, now: string): string {
  const id = permissionIdOf(perm.code)
  const conflict = `ON CONFLICT (code) DO UPDATE SET resource = EXCLUDED.resource, action = EXCLUDED.action, title = EXCLUDED.title, description = EXCLUDED.description, updated_at = ${now}`
  return `INSERT INTO permissions (id, code, resource, action, title, description, created_at, updated_at) VALUES (${sqlString(id)}, ${sqlString(perm.code)}, ${sqlString(perm.resource)}, ${sqlString(perm.action)}, ${sqlString(perm.title)}, ${sqlNullableString(perm.description)}, ${now}, ${now}) ${conflict};`
}

function roleSql(role: BuiltinRoleSeed, force: boolean, now: string): string {
  const id = roleIdOf(role.name)
  const conflict = force
    ? `ON CONFLICT (name) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, updated_at = ${now}`
    : 'ON CONFLICT (name) DO NOTHING'
  return `INSERT INTO roles (id, name, title, description, status, sort_order, created_at, updated_at) VALUES (${sqlString(id)}, ${sqlString(role.name)}, ${sqlString(role.title)}, ${sqlNullableString(role.description)}, 'active', ${role.sortOrder}, ${now}, ${now}) ${conflict};`
}

function rolePermissionSql(role: BuiltinRoleSeed, code: string, now: string): string {
  const roleId = roleIdOf(role.name)
  const permId = permissionIdOf(code)
  const id = `rp:${role.name}:${code}`
  return `INSERT INTO role_permissions (id, role_id, permission_id, created_at) VALUES (${sqlString(id)}, ${sqlString(roleId)}, ${sqlString(permId)}, ${now}) ON CONFLICT (role_id, permission_id) DO NOTHING;`
}

/**
 * 生成默认分类与标签的种子 SQL。
 */
export function buildTaxonomySeedSql(force: boolean, dialect: Dialect): string {
  const now = dialect === 'postgresql' ? 'now()' : "strftime('%s','now')"
  const lines = DEFAULT_TAXONOMIES.map((seed) => taxonomySql(seed, force, now))
  return `${lines.join('\n')}\n`
}

function taxonomySql(seed: TaxonomySeed, force: boolean, now: string): string {
  const id = taxonomyIdOf(seed.type, seed.slug)
  const conflict = force
    ? `ON CONFLICT (type, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, updated_at = ${now}`
    : 'ON CONFLICT (type, slug) DO NOTHING'
  return `INSERT INTO taxonomies (id, type, slug, name, description, sort_order, created_at, updated_at) VALUES (${sqlString(id)}, ${sqlString(seed.type)}, ${sqlString(seed.slug)}, ${sqlString(seed.name)}, ${sqlNullableString(seed.description)}, ${seed.sortOrder}, ${now}, ${now}) ${conflict};`
}

/** 执行种子 SQL：SQLite / D1 走 wrangler，PostgreSQL 走 postgres 客户端。 */
async function applySeed(sql: string, provider: DatabaseProvider, target: string): Promise<number> {
  if (provider === 'postgres' || target === 'pg') {
    const { default: postgres } = await import('postgres')
    const url = process.env.DATABASE_URL
    if (!url) {
      console.error('db:seed:pg 需要 DATABASE_URL')
      return 1
    }
    const client = postgres(url, { prepare: false, max: 1 })
    try {
      await client.unsafe(sql)
    } finally {
      await client.end()
    }
    return 0
  }

  const dir = mkdtempSync(join(tmpdir(), 'db-seed-'))
  const file = join(dir, 'seed.sql')
  writeFileSync(file, sql, 'utf8')
  const remote = target === 'remote' ? '--remote' : '--local'
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', remote, '--file', file],
    { stdio: 'inherit' },
  )
  return result.status ?? 1
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const provider = resolveDatabaseProvider(process.env.DATABASE_PROVIDER)
  const force = argv.includes('--force')
  const target = argv.includes('--remote') ? 'remote' : argv.includes('--pg') ? 'pg' : 'local'
  const overrides = parseSeedOverrides(argv)

  // provider 是 postgres 时只写 PG：`db:seed` 走的是 D1，SQL 方言对不上。
  if (provider === 'postgres' && target !== 'pg') {
    console.error('DATABASE_PROVIDER=postgres 时请用 pnpm db:seed:pg')
    return 1
  }

  // 方言由写入目标决定：写到 PG 用 PG 方言，写到 D1 用 sqlite 方言。
  const dialect: Dialect = target === 'pg' ? 'postgresql' : dialectOf(provider)

  const settings = seedValues(process.env, overrides)
  const sql = `${buildSeedSql(settings, force, dialect)}${buildRbacSeedSql(force, dialect)}${buildTaxonomySeedSql(force, dialect)}`
  console.log(`写入种子数据（provider=${provider} 目标=${target}${force ? ' 覆盖' : ''}）`)
  const code = await applySeed(sql, provider, target)
  if (code === 0) console.log('✅ 种子数据写入完成')
  return code
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exit(await run())
}
