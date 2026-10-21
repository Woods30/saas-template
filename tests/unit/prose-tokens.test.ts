import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * prose 排版接入守卫：`prose` 曾是死类名（插件未装，Tailwind 静默不生成）。
 * 断言 globals.css 已 @plugin 且 prose 变量映射到品牌令牌。
 */
const globals = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf-8')

describe('prose 品牌化', () => {
  it('globals.css 注册了 typography 插件', () => {
    expect(globals).toContain('@plugin "@tailwindcss/typography"')
  })

  it('prose 正文与标题色映射到品牌令牌', () => {
    expect(globals).toContain('--tw-prose-body: var(--foreground)')
    expect(globals).toContain('--tw-prose-headings: var(--foreground)')
  })

  it('prose 链接色用主色，而非默认灰阶', () => {
    expect(globals).toContain('--tw-prose-links: var(--primary)')
  })
})
