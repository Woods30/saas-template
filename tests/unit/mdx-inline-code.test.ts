import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * MDX 行内代码反引号守卫：typography 插件会给 `.prose` 内的行内 `code` 加伪元素引号，
 * 必须用 `content: none` 关掉。读 `mdx.css` 源码而非构建产物。
 */
const mdx = readFileSync(new URL('../../src/styles/mdx.css', import.meta.url), 'utf-8')

describe('MDX 行内代码样式', () => {
  it('mdx.css 关掉 typography 给行内 code 加的伪元素引号', () => {
    // 断言规则块本体，而非注释里的文字。
    expect(mdx).toMatch(/\.mdx code::before\s*,\s*\.mdx code::after\s*\{[^}]*content:\s*none/)
  })
})
