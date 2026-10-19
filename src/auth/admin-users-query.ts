import { and, eq, like, or, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * 管理员用户列表的筛选条件与类型。
 *
 * 单独一个模块（而不是塞进 `admin-users.ts`）是为了让它在不引入
 * server-context / auth / D1 的前提下被测试引用：这里只依赖 drizzle，
 * 服务端与测试两端共用同一份实现，避免「测试跑的逻辑和线上不同」。
 */

/** `users` 表里本页要用的字段。`role` 可空：非 admin 插件写入前可能为空。 */
export interface AdminUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role?: string | null
  banned?: boolean | null
  /** 封禁到期时间；null 表示永久封禁或从未封禁，两者由 `banned` 区分。 */
  banExpires?: Date | string | null
  /** 管理员填写的封禁原因；未填时为空，解封后插件不清空，故只在 `banned` 时展示。 */
  banReason?: string | null
  createdAt: Date | string
}

export type AdminUserRoleFilter = 'all' | 'user' | 'admin'
export type AdminUserStatusFilter = 'all' | 'active' | 'banned'

export interface AdminUsersQuery {
  /** 邮箱关键词（大小写不敏感的子串匹配）。空串等于不过滤。 */
  search?: string
  role?: AdminUserRoleFilter
  status?: AdminUserStatusFilter
  limit?: number
  offset?: number
}

export interface AdminUsersResult {
  users: AdminUser[]
  total: number
}

/**
 * LIKE 通配符转义。
 *
 * `contains` 之类的辅助函数对 `%` / `_` **不转义**：搜 `a_b` 会命中 `axb`，
 * 搜 `%` 会命中几乎所有行。管理员是把它当「邮箱片段精确查找」用的，故这里显式
 * 转义后再交给 `like`。`\\` 自身也转义，否则无法搜索字面反斜杠。
 */
export function escapeLike(input: string): string {
  return input.replace(/([%_\\])/g, '\\$1')
}

/**
 * 拼 `where` 条件；三个筛选缺省时返回 `undefined`（无 `where`）。
 *
 * 按列拆分，每个条件独立可空，最后用 `and` 组合——这样任何组合（含全空）
 * 都走同一条路径，不需要为「两个」「三个」各写一遍。
 */
export function buildUserWhere(
  users: {
    email: SQLiteColumn
    role: SQLiteColumn
    banned: SQLiteColumn
  },
  query: AdminUsersQuery,
) {
  const needle = query.search?.trim()
  const conditions = [
    needle
      ? // SQLite 的 LIKE 只对 ASCII 大小写不敏感，转成小写让比较不依赖 collation，
        // 同时也覆盖非 ASCII 的本地大小写差异。
        like(sql`lower(${users.email})`, `%${escapeLike(needle)}%`)
      : undefined,
    query.role && query.role !== 'all' ? eq(users.role, query.role) : undefined,
    // `banned` 列可空：老数据或插件之外写入的行可能是 NULL，语义上等同未封禁。
    // 只写 `eq(banned, false)` 会让这些行从「正常」里消失。
    query.status === 'banned'
      ? eq(users.banned, true)
      : query.status === 'active'
        ? or(sql`${users.banned} is null`, eq(users.banned, false))
        : undefined,
  ].filter((condition) => condition !== undefined)

  return conditions.length > 0 ? and(...conditions) : undefined
}
