/**
 * 跨模块复用的 SQL 片段构造。
 *
 * 放 core 而不是某个模块里：LIKE 转义这类细节与业务无关，两个模块都要用。
 */

/**
 * LIKE 通配符转义。
 *
 * `contains` 等辅助函数不转义 `%` / `_`：搜 `a_b` 会命中 `axb`，搜 `%` 几乎命中所有行。
 * 反斜杠本身也要转义，否则它会吃掉后面字符的转义意义。
 */
export function escapeLike(input: string): string {
  return input.replace(/([%_\\])/g, '\\$1')
}
