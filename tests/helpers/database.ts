import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { DB } from '../../src/core/db'

/**
 * 内存 SQLite + drizzle 代理。
 *
 * 账本、用量这类用例要验的是**真 SQL 语义**（条件更新、唯一约束、RETURNING），
 * 假 db 验不出来，所以这里跑真的 SQLite——只是不落盘。
 *
 * 表结构来自 `src/core/db/migrations/sqlite`（`pnpm db:setup` 的本地产物），
 * 与运行时的表结构一致。
 */
export function createTestDatabase(): { sqlite: DatabaseSync; db: DB } {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/core/db/migrations/sqlite')
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/core/db/migrations/sqlite/${name}`, 'utf8'))
  }
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) }
  })
  return { sqlite, db: db as unknown as DB }
}

/** 塞一个用户：账本的行都挂在用户下。 */
export function seedUser(sqlite: DatabaseSync, id: string): void {
  sqlite.exec(
    `INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('${id}','User','${id}@example.com',1,1)`,
  )
}
