/**
 * 跨模块复用的 SQL 片段构造。
 *
 * 放 core 而不是某个模块里：子串匹配这类细节与业务无关，两个模块都要用。
 */
import { type SQLWrapper, sql } from 'drizzle-orm'
import { isPostgresDialect } from './provider'
import { SCHEMA_DIALECT } from './schema'

/**
 * 大小写不敏感的子串匹配。
 *
 * **不用 `LIKE`**：D1 的 SQLite 对 LIKE 模式长度有上限（实测 50 字节，含首尾 `%`），
 * 超过就报 `D1_ERROR: LIKE or GLOB pattern too complex`。搜索词是用户输入，长度不可控——
 * 邮箱稍长一点整页就 500。
 *
 * 改用「找下标」：SQLite 是 `instr(haystack, needle)`，PostgreSQL 是
 * `strpos(haystack, needle)`，都返回 1 起的下标，找不到返回 0。
 * 方言在生成物 `schema.ts` 里是编译期常量，分支会被静态消掉。
 *
 * 顺带修掉通配符语义：`%` / `_` 现在按字面匹配。旧的 `LIKE` 版本虽然转义了它们，
 * 却没带 `ESCAPE` 子句——SQLite 不把 `\` 当转义符，搜 `a_b` 反而搜不到 `axb`。
 */
export function containsInsensitive(column: SQLWrapper, needle: string) {
  if (isPostgresDialect(SCHEMA_DIALECT)) {
    return sql`strpos(lower(${column}), lower(${needle})) > 0`
  }
  return sql`instr(lower(${column}), lower(${needle})) > 0`
}
