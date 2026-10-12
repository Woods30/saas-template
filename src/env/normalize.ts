/**
 * 把空串归一为 `undefined`。
 *
 * `.env.example` 的 optional 字段留空后，Vite 会把它们注入为 `import.meta.env.X = ''`；
 * 而 Zod 的 `optional()` / `default()` 只识别 `undefined`，空串会被当成非法值，
 * 导致「照 README 复制 `.env.example` 为 `.env`」后应用启动即抛错。
 *
 * 因此在 env 校验层统一把空串视为「未设置」，`.env.example` 的留空字段交由 schema 的
 * 默认值 / `optional()` 接管。校验脚本同样经由此层，避免各处复制另一套空值规则。
 */
export function treatEmptyAsUndefined(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    result[key] = value === '' ? undefined : value
  }
  return result
}
