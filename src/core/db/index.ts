/**
 * 数据库连接入口。
 *
 * provider 由 `DATABASE_PROVIDER` 决定：
 * - `sqlite`（默认）：本地 SQLite 文件；跑在 Workers 上时用 D1 binding（D1 本身就是 SQLite）。
 * - `d1`：显式要求 Cloudflare D1 binding。
 * - `postgres`：PostgreSQL；Workers 上走 Hyperdrive binding，Node 上走 `DATABASE_URL`。
 *
 * 手写 schema 按方言各一份，生成物 `src/core/db/schema.ts` 指向其中一份。
 * 运行期会校验「生成时的方言」与「运行时声明的 provider」是否一致——
 * 不一致时 SQL 会静默跑错方言，必须当场报错。
 *
 * **本模块必须保持客户端安全**：静态依赖只有 schema 与 provider 解析，都是纯数据。
 * 连接实现（postgres 驱动、D1 驱动、请求作用域）走动态 import——它们带着
 * `postgres` / `node:async_hooks` 这类 Node 内置模块，一旦被静态 import 进客户端图，
 * 浏览器里会抛 `Buffer is not defined`（postgres-js 读 `Buffer.prototype`）或
 * `AsyncLocalStorage is not a constructor`（请求作用域在模块顶层就 new 了一个），
 * 整站水合失败，页面只剩白屏。业务模块静态 import 本模块取 `schema` 是安全的。
 */
import { type DatabaseProvider, dialectOf, resolveDatabaseProvider } from './provider'
import * as schema from './schema'
import type { DB } from './types'

export type { DB }
export { schema }

/** 连接来源。 */
export interface DbSource {
  provider: DatabaseProvider
  /** D1 binding（provider = `d1` / `sqlite` 且跑在 Workers 上）。 */
  binding?: D1Database
  /** PostgreSQL 连接串（provider = `postgres`）。 */
  url?: string
}

/** 运行期需要的 env 片段。 */
export interface DbEnv {
  DATABASE_PROVIDER?: string
  DATABASE_URL?: string
  DB?: D1Database
  HYPERDRIVE?: { connectionString: string }
}

/**
 * 校验 provider 与生成物方言一致。
 *
 * 生成物由 `pnpm db:setup` 产出：改了 `DATABASE_PROVIDER` 却没重新生成，
 * 全仓的表定义仍是另一个方言的——查询会生成对方方言的 SQL，错误信息往往
 * 出现在很远的调用栈上。这里当场拦下，并给出修复命令。
 */
export function assertSchemaMatchesProvider(provider: DatabaseProvider): void {
  const expected = dialectOf(provider)
  if (schema.SCHEMA_DIALECT !== expected) {
    throw new Error(
      `数据库方言不匹配：DATABASE_PROVIDER=${provider} 需要 ${expected} schema，` +
        `当前生成物是 ${schema.SCHEMA_DIALECT}。请重新运行 pnpm db:setup。`,
    )
  }
}

/**
 * 按来源建连接。
 *
 * 传 D1 binding（旧的 `createDb(env.DB)` 写法）按 `d1` 处理，保持既有调用点不变。
 *
 * 异步：驱动实现按需加载，静态 import 会把 Node 内置模块带进客户端图。
 */
export async function createDb(source: D1Database | DbSource): Promise<DB> {
  const resolved: DbSource = 'provider' in source ? source : { provider: 'd1', binding: source }
  switch (resolved.provider) {
    case 'postgres': {
      if (!resolved.url) {
        throw new Error('DATABASE_PROVIDER=postgres 需要 DATABASE_URL 或 Hyperdrive binding')
      }
      const { createPostgresDb } = await import('./postgres')
      return createPostgresDb(resolved.url)
    }
    case 'sqlite':
    case 'd1': {
      if (!resolved.binding) {
        throw new Error(`DATABASE_PROVIDER=${resolved.provider} 需要 D1 binding（env.DB）`)
      }
      const { drizzle: drizzleD1 } = await import('drizzle-orm/d1')
      // `DB` 的类型跟着生成物的方言走；本分支只有生成物是 sqlite 时才会被调用，
      // 但类型检查不区分生成物，故此处收窄一次。
      return drizzleD1(resolved.binding, { schema }) as unknown as DB
    }
  }
}

/**
 * 按 env 建连接。
 *
 * PostgreSQL 的连接挂在请求作用域上：Workers 的 isolate 可能在请求之间冻结，
 * 跨请求复用的 TCP 连接会失效。
 */
export async function createDbFromEnv(env: DbEnv): Promise<DB> {
  const provider = resolveDatabaseProvider(env.DATABASE_PROVIDER)
  assertSchemaMatchesProvider(provider)

  if (provider === 'postgres') {
    const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_PROVIDER=postgres 需要 DATABASE_URL 或 Hyperdrive binding')
    }
    const [{ createPostgresDb }, { getRequestScoped }] = await Promise.all([
      import('./postgres'),
      import('./request-scope'),
    ])
    return getRequestScoped(`postgres:db:${url}`, () => createPostgresDb(url))
  }

  if (!env.DB) {
    throw new Error(`DATABASE_PROVIDER=${provider} 需要 D1 binding（env.DB）`)
  }
  return createDb({ provider, binding: env.DB })
}
