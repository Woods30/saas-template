import { describe, expect, it } from 'vitest'
import { buildSetAdminSql } from '../../scripts/set-admin'

/**
 * `scripts/set-admin.ts` 的 SQL 构造是唯一有逻辑的部分，单独测。
 *
 * 这里不 import `src/`：`scripts/` 目录没有 `@/*` 别名，测试也刻意只覆盖纯函数，
 * 不触碰 `execSync`（那会真的调 wrangler）。
 */
describe('buildSetAdminSql', () => {
  it('正常邮箱生成 UPDATE ... WHERE email 语句', () => {
    expect(buildSetAdminSql('alice@example.com')).toBe(
      "UPDATE users SET role = 'admin' WHERE email = 'alice@example.com'",
    )
  })

  it('邮箱中的单引号被转义为两个单引号，不会截断 SQL', () => {
    // 单引号是 SQL 字符串的定界符；不转义会拼出语法错误，更是注入入口。
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
