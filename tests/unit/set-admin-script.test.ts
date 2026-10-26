import { describe, expect, it } from 'vitest'
import { buildSetAdminSql } from '../../scripts/set-admin'

/** `scripts/set-admin.ts` 的 SQL 构造；只测纯函数，不触碰会真调 wrangler 的 `execSync`。 */
describe('buildSetAdminSql', () => {
  it('正常邮箱生成 UPDATE ... WHERE email 语句', () => {
    expect(buildSetAdminSql('alice@example.com')).toBe(
      "UPDATE users SET role = 'admin' WHERE email = 'alice@example.com'",
    )
  })

  it('邮箱中的单引号被转义为两个单引号，不会截断 SQL', () => {
    // 不转义单引号会拼出语法错误，更是注入入口。
    expect(buildSetAdminSql("o'brien@example.com")).toContain("o''brien@example.com")
  })

  it('拒绝不含 @ 的非法邮箱', () => {
    expect(() => buildSetAdminSql('not-an-email')).toThrow()
  })

  it('拒绝空字符串', () => {
    expect(() => buildSetAdminSql('')).toThrow()
  })

  it('拒绝带 shell 元字符的「邮箱」，堵住命令注入', () => {
    for (const evil of ['$(whoami)@example.com', 'a;rm -rf /@example.com', 'a`id`@x.com']) {
      expect(() => buildSetAdminSql(evil)).toThrow()
    }
  })
})
