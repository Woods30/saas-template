/**
 * KV Cache 模块。
 *
 * 使用 ALS 注入的 `KVCacheProvider`（per-request），而非 module-level 单例，
 * 与 `src/lib/server-context.ts` 的 env 注入模式保持一致。
 *
 * 调用方通过 `getServerContext().cacheProvider` 访问 provider；
 * 无 ALS context 时（如测试环境）各函数自动降级为 pass-through（不缓存）。
 */
import { getServerContext } from '@/lib/server-context'
import { CACHE_TTL } from './constants'

export { CACHE_TTL }

export function createCacheKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p).replace(/[:]/g, '_')).join(':')
}

export async function getOrSetCache<T>(opts: {
  key: string
  ttlSeconds: number
  fetcher: () => Promise<T>
}): Promise<T> {
  const { cacheProvider } = getServerContext()
  if (!cacheProvider) return opts.fetcher()
  const cached = await cacheProvider.get<T>(opts.key)
  if (cached !== null) return cached
  const fresh = await opts.fetcher()
  await cacheProvider.set(opts.key, fresh, opts.ttlSeconds)
  return fresh
}

export async function deleteCache(key: string): Promise<void> {
  const { cacheProvider } = getServerContext()
  if (!cacheProvider) return
  await cacheProvider.delete(key)
}

export async function deleteCacheByPrefix(prefix: string): Promise<void> {
  const { cacheProvider } = getServerContext()
  if (!cacheProvider) return
  await cacheProvider.deleteByPrefix(prefix)
}
