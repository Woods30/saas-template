/**
 * 核心区清单：「全量回归 + e2e」的判定依据，本地与 CI 共用，不得两处各写一份。
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
  const normalized = file.replace(/^\.\//, '').replace(/\\/g, '/')
  return CORE_PATHS.some((prefix) => normalized.startsWith(prefix))
}
