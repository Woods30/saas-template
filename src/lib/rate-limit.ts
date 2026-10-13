// Env is a global interface declared in src/types/cloudflare.d.ts — no import needed
import { createCacheKey } from '@/cache'
import { getServerContext } from '@/lib/server-context'

/**
 * Check if the given IP/action pair exceeds rate limit.
 * Returns true if allowed, false if rate-limited.
 *
 * Uses a list-of-timestamps approach: stores an array of request timestamps
 * within the TTL window. This avoids read-modify-write races on a counter.
 *
 * Security notes:
 * - cf-connecting-ip is trusted; x-forwarded-for is not used (spoofable).
 * - When cache is unavailable, fails closed (denies the request).
 * - Unknown IPs get a stricter limit (1/min) to mitigate spoofing attempts.
 */
export async function checkRateLimit(opts: {
  ip: string
  action: string
  limit: number
  windowSeconds: number
  prefix?: string
}): Promise<boolean> {
  const { cacheProvider } = getServerContext()

  // Fail closed — deny when cache is unavailable
  if (!cacheProvider) {
    return false
  }

  const { ip, action, limit, windowSeconds, prefix = 'ratelimit' } = opts
  const isUnknown = ip === 'unknown'
  const maxRequests = isUnknown ? 1 : limit

  const key = createCacheKey(prefix, ip, action)
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  const raw = await cacheProvider.get<number[]>(key)
  // Timestamps strictly within the window
  const timestamps: number[] = raw !== null ? raw.filter((t) => now - t < windowMs) : []

  if (timestamps.length >= maxRequests) {
    return false
  }

  timestamps.push(now)
  await cacheProvider.set(key, timestamps, windowSeconds)
  return true
}
