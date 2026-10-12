import { publicEnv } from '@/env/public'

/** 站点基址（已去除尾部斜杠），例如 `https://example.com`。 */
export function getBaseUrl(): string {
  return publicEnv.VITE_BASE_URL.replace(/\/+$/, '')
}

/**
 * 规范化前导斜杠：缺少时补上（`pricing` → `/pricing`，`og.png` → `/og.png`），
 * 已有则原样保留，空串归一为站点根路径 `/`。
 *
 * canonical path 与 SEO 图片相对路径共用同一规范化，避免两处各写一份。
 */
export function normalizeLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * 把站内 path 拼成绝对 canonical URL。
 *
 * - 缺少前导斜杠时补上（`pricing` → `/pricing`）；
 * - 空 path 规范化为站点根（`/`）；
 * - 基址与 path 之间不会出现双斜杠。
 */
export function getCanonicalUrl(path: string): string {
  return `${getBaseUrl()}${normalizeLeadingSlash(path)}`
}
