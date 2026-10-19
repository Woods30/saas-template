import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { buildUserWhere, escapeLike } from '@/auth/admin-users-query'
import { schema } from '@/db'

/**
 * 用户列表筛选条件的 SQL 生成。
 *
 * 三处容易静默出错的细节：
 * - 搜索必须按**字面**匹配，`%` / `_` 不能被解释成通配符；
 * - `banned` 列可空，「正常」要把 NULL 也算进来，否则污数据从正常视图里消失；
 * - 三个条件是 AND 组合，任何组合都必须落在同一个 `where` 里。
 */

const dialect = new SQLiteSyncDialect()

function build(where: ReturnType<typeof buildUserWhere>) {
  return where ? dialect.sqlToQuery(where) : null
}

describe('escapeLike', () => {
  it('转义 % 与 _，避免被当成通配符', () => {
    expect(escapeLike('a_b%c')).toBe('a\\_b\\%c')
  })

  it('转义反斜杠本身', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('普通字符串原样返回', () => {
    expect(escapeLike('user@example.com')).toBe('user@example.com')
  })
})

describe('buildUserWhere', () => {
  it('没有任何筛选时不生成 where', () => {
    expect(buildUserWhere(schema.users, {})).toBeUndefined()
    expect(
      buildUserWhere(schema.users, { search: '   ', role: 'all', status: 'all' }),
    ).toBeUndefined()
  })

  it('按邮箱子串匹配', () => {
    const q = build(buildUserWhere(schema.users, { search: 'E2E' }))
    expect(q?.sql).toContain('lower(')
    expect(q?.params).toEqual(['%E2E%'])
  })

  it('含 % 与 _ 的搜索词按字面匹配', () => {
    const q = build(buildUserWhere(schema.users, { search: 'a_b%c' }))
    // 未转义时 `_` 会命中任意单字符、`%` 会命中任意串。
    expect(q?.params).toEqual(['%a\\_b\\%c%'])
  })

  it('按角色筛选用等于比较', () => {
    const q = build(buildUserWhere(schema.users, { role: 'admin' }))
    expect(q?.sql).toContain('"users"."role" = ?')
    expect(q?.params).toContain('admin')
  })

  it('已封禁用 banned = true', () => {
    const q = build(buildUserWhere(schema.users, { status: 'banned' }))
    expect(q?.sql).toContain('"users"."banned" = ?')
    // SQLite 没有布尔类型，drizzle 把 true 序列化成 1。
    expect(q?.params).toContain(1)
  })

  it('正常状态把 banned 为 NULL 的行也算进来', () => {
    const q = build(buildUserWhere(schema.users, { status: 'active' }))
    expect(q?.sql.toLowerCase()).toContain('"users"."banned" is null')
    // SQLite 没有布尔类型，drizzle 把 false 序列化成 0。
    expect(q?.params).toContain(0)
  })

  it('三个条件同时生效', () => {
    const q = build(buildUserWhere(schema.users, { search: 'e2e', role: 'user', status: 'banned' }))
    expect(q?.sql.toLowerCase()).toContain(' and ')
    expect(q?.params).toHaveLength(3)
  })
})
