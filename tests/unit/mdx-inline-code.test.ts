import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * MDX 行内代码反引号守卫。
 *
 * typography 插件会给 `.prose` 内的行内 `code` 加伪元素引号
 * （`code::before/after { content: "\`" }`），而 MDX 根节点是
 * `<div className="mdx prose">`，行内 code 是 `.prose` 的直接后代，
 * 于是每个行内代码都会渲染出字面反引号——本仓已自行为行内代码定样式，
 * 必须用 `content: none` 关掉这对伪元素。
 *
 * 用源码断言而非构建产物：CI 未必先 `pnpm build`，读 `mdx.css` 文本更稳定，
 * 与 prose-tokens.test.ts 的守卫风格一致。
 */
const mdx = readFileSync(new URL('../../src/styles/mdx.css', import.meta.url), 'utf-8')

describe('MDX 行内代码样式', () => {
  it('mdx.css 关掉 typography 给行内 code 加的伪元素引号', () => {
    // 断言规则块本体（选择器 + 声明），而非注释里的文字。
    expect(mdx).toMatch(/\.mdx code::before\s*,\s*\.mdx code::after\s*\{[^}]*content:\s*none/)
  })
})
