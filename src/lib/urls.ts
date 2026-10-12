import { publicEnv } from '@/env/public'

/** 站点基址（已去除尾部斜杠），例如 `https://example.com`。 */
export function getBaseUrl(): string {
  return publicEnv.VITE_BASE_URL.replace(/\/+$/, '')
}

/**
 * 把站内 path 拼成绝对 canonical URL。
 *
 * - 缺少前导斜杠时补上（`pricing` → `/pricing`）；
 * - 空 path 规范化为站点根（`/`）；
 * - 基址与 path 之间不会出现双斜杠。
 */
export function getCanonicalUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getBaseUrl()}${normalized}`
}
