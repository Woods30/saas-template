import { isPostgresDialect } from './provider'
import * as schema from './schema'
import type { DB } from './types'

/**
 * 事务包装。
 *
 * 语义按方言不同，业务代码只管写 `atomic(db, async (tx) => ...)`：
 *
 * - **PostgreSQL**：真事务。回调抛错即回滚。
 * - **D1 / SQLite（Workers）**：D1 **没有交互式事务**——`BEGIN` / `COMMIT` 不被支持，
 *   原子性来自「单条语句本身是原子的」。因此这里不包事务，回调内的多条语句之间
 *   可能被其他请求插空。需要原子性的写操作必须写成**单条条件更新**
 *   （例如 `WHERE balance >= amount` 的 UPDATE，靠影响行数判断成败），
 *   而不是「先查后写」。
 *
 * v0.13.0 补 Node 运行时后，本地 SQLite 文件走真事务，届时本函数按方言分派。
 */
export async function atomic<T>(db: DB, fn: (tx: DB) => Promise<T>): Promise<T> {
  if (isPostgresDialect(schema.SCHEMA_DIALECT)) {
    return db.transaction(async (tx) => fn(tx as unknown as DB))
  }
  return fn(db)
}
