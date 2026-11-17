import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

/**
 * 统一的数据库句柄类型。
 *
 * 运行期可能是 D1、PostgreSQL 或本地 SQLite，三者的 drizzle 实例类型互不相同，
 * 但本仓用到的操作（`select` / `insert` / `update` / `delete` / `transaction`）
 * 签名一致，因此在 `createDb` 里收敛到同一个 `DB`。
 *
 * **类型必须跟着生成物的方言走**：`schema.ts` 由 `pnpm db:setup` 按
 * `DATABASE_PROVIDER` 生成，指向 sqlite 或 postgres 各自那一份表定义。句柄类型
 * 若写死成 D1，换成 PostgreSQL 表定义后连「选哪几列」都会类型不匹配——
 * 查询构造器的类型同时受驱动与表定义约束，不是只由表定义决定。
 * 所以这里用条件类型：生成物是哪种方言，句柄就是哪种方言的实例类型。
 *
 * `transaction` 的语义按方言不同，见 `src/core/db/atomic.ts`。
 */
export type DB = typeof schema.SCHEMA_DIALECT extends 'postgresql'
  ? PostgresJsDatabase<typeof schema>
  : DrizzleD1Database<typeof schema>

export { schema }
