/**
 * 把空串归一为 `undefined`。
 *
 * `.env.example` 里留空的 optional 字段会被注入为 `''`，而 Zod 的 `optional()` /
 * `default()` 只识别 `undefined`，不归一化就会让照抄 `.env.example` 的应用启动即抛错。
 * 校验脚本也经由此层，避免各处复制另一套空值规则。
 */
export function treatEmptyAsUndefined(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    result[key] = value === '' ? undefined : value
  }
  return result
}
