import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { buildUserWhere } from '@/core/auth/admin-users-query'
import { schema } from '@/core/db'
import { isPostgresDialect } from '@/core/db/provider'
import { SCHEMA_DIALECT } from '@/core/db/schema'
import { containsInsensitive } from '@/core/db/sql'

/**
 * 子串匹配与用户列表筛选条件的 SQL 生成。
 *
 * 关键约束：**不能用 `LIKE` 拼模式**——D1 的 SQLite 对模式长度有上限，
 * 搜索词一长就 500；`%` / `_` 也必须按字面匹配。
 * 另外 `banned` 可空，「正常」要含 NULL；三个条件以 AND 组合在同一个 `where` 里。
 */

const dialect = new SQLiteSyncDialect()

/** 子串匹配用的函数名按方言不同，断言跟着生成物走。 */
const positionFn = isPostgresDialect(SCHEMA_DIALECT) ? 'strpos(' : 'instr('

function build(where: ReturnType<typeof buildUserWhere>) {
  return where ? dialect.sqlToQuery(where) : null
}

describe('containsInsensitive', () => {
  it('按「找下标」匹配，不拼 LIKE 模式', () => {
    const q = dialect.sqlToQuery(containsInsensitive(schema.users.email, 'E2E'))
    expect(q.sql).toContain(positionFn)
    expect(q.sql.toLowerCase()).not.toContain('like')
    // 搜索词原样绑定，不加通配符。
    expect(q.params).toEqual(['E2E'])
  })

  it('搜索词再长也不改形状', () => {
    const needle = 'a'.repeat(80)
    const q = dialect.sqlToQuery(containsInsensitive(schema.users.email, needle))
    expect(q.sql.toLowerCase()).not.toContain('like')
    expect(q.params).toEqual([needle])
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
    expect(q?.sql).toContain(positionFn)
    // 搜索词原样作为一个参数绑定：不再拼成 `%词%` 的通配模式。
    expect(q?.params).toEqual(['E2E'])
  })

  it('不用 LIKE 拼模式', () => {
    // D1 的 SQLite 对 LIKE 模式长度有上限（实测 50 字节），超了整页 500。
    // 搜索词长度不可控，必须走「找下标」而不是通配模式。
    const q = build(buildUserWhere(schema.users, { search: 'a'.repeat(80) }))
    expect(q?.sql.toLowerCase()).not.toContain('like')
    expect(q?.params).toEqual(['a'.repeat(80)])
  })

  it('含 % 与 _ 的搜索词按字面匹配', () => {
    const q = build(buildUserWhere(schema.users, { search: 'a_b%c' }))
    // 未转义时 `_` 命中任意单字符、`%` 命中任意串；这里没有通配符，按字面找。
    expect(q?.params).toEqual(['a_b%c'])
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
