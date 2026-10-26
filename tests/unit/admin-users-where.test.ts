import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { buildUserWhere, escapeLike } from '@/auth/admin-users-query'
import { schema } from '@/db'

/**
 * 用户列表筛选条件的 SQL 生成：`%` / `_` 须按字面匹配；`banned` 可空，「正常」要含
 * NULL；三个条件以 AND 组合在同一个 `where` 里。
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
    // 未转义时 `_` 命中任意单字符、`%` 命中任意串。
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
    // SQLite 无布尔类型，true 序列化为 1。
    expect(q?.params).toContain(1)
  })

  it('正常状态把 banned 为 NULL 的行也算进来', () => {
    const q = build(buildUserWhere(schema.users, { status: 'active' }))
    expect(q?.sql.toLowerCase()).toContain('"users"."banned" is null')
    // SQLite 无布尔类型，false 序列化为 0。
    expect(q?.params).toContain(0)
  })

  it('三个条件同时生效', () => {
    const q = build(buildUserWhere(schema.users, { search: 'e2e', role: 'user', status: 'banned' }))
    expect(q?.sql.toLowerCase()).toContain(' and ')
    expect(q?.params).toHaveLength(3)
  })
})
