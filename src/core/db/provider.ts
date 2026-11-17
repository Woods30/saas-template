/**
 * 数据库 provider 解析与方言映射。
 *
 * 这是**纯函数**模块：provider 由环境变量决定，但解析规则必须能在没有 env、
 * 没有数据库的情况下被单测覆盖，所以不放任何 IO。
 *
 * 术语：
 * - provider：使用者声明的数据库形态（`sqlite` / `d1` / `postgres`）。
 * - dialect：schema 与迁移 SQL 的方言（`sqlite` / `postgresql`）。
 *   D1 本身就是 SQLite，因此 `d1` 与 `sqlite` 共用 sqlite 方言。
 */

/** 支持的 provider。`sqlite` 是 clone 后的默认值。 */
export const DATABASE_PROVIDERS = ['sqlite', 'd1', 'postgres'] as const

export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number]

/** drizzle-kit 的方言名。 */
export type Dialect = 'sqlite' | 'postgresql'

/** 迁移输出目录名：两个方言的 SQL 不可混用，各自一个目录。 */
export type MigrationDir = 'sqlite' | 'postgres'

const PROVIDER_ALIASES: Record<string, DatabaseProvider> = {
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  file: 'sqlite',
  d1: 'd1',
  cloudflare: 'd1',
  pg: 'postgres',
  postgres: 'postgres',
  postgresql: 'postgres',
}

/**
 * 解析 `DATABASE_PROVIDER`。
 *
 * 未设置或空串 → `sqlite`（clone 后开箱即用的本地库）。
 * 无法识别的值**直接抛错**：静默回退会让使用者以为在用 PostgreSQL，
 * 实际连的是 SQLite，问题要到写数据时才暴露。
 */
export function resolveDatabaseProvider(raw: string | undefined | null): DatabaseProvider {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '') {
    return 'sqlite'
  }
  const provider = PROVIDER_ALIASES[value]
  if (provider === undefined) {
    throw new Error(`未知的 DATABASE_PROVIDER：${raw}（可选值：${DATABASE_PROVIDERS.join(' / ')}）`)
  }
  return provider
}

/** provider → schema 与迁移 SQL 的方言。D1 是 SQLite，落在 sqlite 方言。 */
export function dialectOf(provider: DatabaseProvider): Dialect {
  return provider === 'postgres' ? 'postgresql' : 'sqlite'
}

/** provider → 迁移输出目录名。 */
export function migrationDirOf(provider: DatabaseProvider): MigrationDir {
  return provider === 'postgres' ? 'postgres' : 'sqlite'
}

/** provider → 手写 schema 文件名。生成物 `schema.ts` 由它复制而来。 */
export function schemaFileOf(
  provider: DatabaseProvider,
): 'schema.sqlite.ts' | 'schema.postgres.ts' {
  return provider === 'postgres' ? 'schema.postgres.ts' : 'schema.sqlite.ts'
}

/**
 * 判断某个方言是不是 PostgreSQL。
 *
 * 形参刻意收 `string`：生成物 `schema.ts` 的 `SCHEMA_DIALECT` 是**字面量类型**
 * （`'sqlite'` 或 `'postgresql'`），直接和 `'postgresql'` 比较会被 TS 判为
 * 「两个类型无交集」而报错——那只是当前生成物的取值，不是取值集合。
 */
export function isPostgresDialect(dialect: string): boolean {
  return dialect === 'postgresql'
}
