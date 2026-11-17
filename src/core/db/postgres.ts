import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import type { DB } from './types'

/**
 * 创建 PostgreSQL 连接。
 *
 * `prepare: false`：事务池（Supabase / Neon / PgBouncer）与部分托管实例不支持
 * 服务端预编译语句，开了会在特定场景报 "prepared statement already exists"。
 * Hyperdrive 自己缓存语句，不依赖客户端预编译。
 *
 * `max: 1`：连接由 Hyperdrive 在服务端池化，客户端只需一条连接；
 * Workers 上每请求新建客户端，多连接会徒增握手开销。
 */
export function createPostgresDb(url: string): DB {
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
  })
  return drizzlePg(client, { schema }) as unknown as DB
}
