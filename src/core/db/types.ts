import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'

/**
 * 统一的数据库句柄类型。
 *
 * 运行期可能是 D1、PostgreSQL 或本地 SQLite，三者的 drizzle 实例类型互不相同，
 * 但本仓用到的操作（`select` / `insert` / `update` / `delete` / `transaction`）
 * 签名一致。统一按 D1 形态建模，其余方言在 `createDb` 里收敛到该类型——
 * 查询构造器的类型来自**表定义**而非驱动，所以切方言不会让类型失真。
 *
 * `transaction` 的语义按方言不同，见 `src/core/db/atomic.ts`。
 */
export type DB = DrizzleD1Database<typeof schema>

export { schema }
