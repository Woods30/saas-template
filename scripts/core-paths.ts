/**
 * 核心区清单——「全量回归 + e2e」的判定依据，**单一事实来源**。
 *
 * 本地 `pnpm check:core` 与 CI 的 e2e 触发条件都读这里，不得两处各写一份。
 * 命中以下任一前缀即视为核心变更：这些区域的缺陷影响面广或涉及安全边界，
 * 值得每次改动都跑完整回归。
 */
export const CORE_PATHS: readonly string[] = [
  'src/auth/',
  'src/payment/',
  'src/env/',
  'src/lib/module-access.ts',
  'src/lib/module-access.server.ts',
  'src/db/',
  'src/server.ts',
  'src/routes/api/',
  'src/config/website.ts',
  'src/lib/locale.ts',
  'src/locale/middleware.ts',
  'drizzle.config.ts',
  'drizzle.config.local.ts',
  'wrangler.jsonc',
]

/** 某文件路径是否落在核心区。 */
export function isCorePath(file: string): boolean {
  // 归一化：去掉可能的 ./ 前缀，统一用 / 分隔。
  const normalized = file.replace(/^\.\//, '').replace(/\\/g, '/')
  return CORE_PATHS.some((prefix) => normalized.startsWith(prefix))
}
