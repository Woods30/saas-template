// Env is a global interface declared in src/types/cloudflare.d.ts — no import needed
import { CACHE_TTL, createCacheKey, deleteCache, getOrSetCache } from '@/cache'
import { getServerContext } from '@/lib/server-context'
import { BeehiivNewsletterProvider } from './provider/beehiiv'
import { ResendNewsletterProvider } from './provider/resend'
import type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
} from './types'

export type NewsletterProviderName = 'resend' | 'beehiiv'
type NewsletterProviderFactory = () => NewsletterProvider

/**
 * 按当前请求 env 构建 newsletter provider 注册表。
 * 在 src/server.ts 的 als.run() 中调用，结果注入 ServerContext.newsletterProviderRegistry。
 */
export function buildNewsletterProviderRegistry(
  env: Env,
): Record<NewsletterProviderName, NewsletterProviderFactory | undefined> {
  return {
    resend:
      env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID
        ? () => new ResendNewsletterProvider(env.RESEND_API_KEY ?? '', env.RESEND_AUDIENCE_ID ?? '')
        : undefined,
    beehiiv:
      env.BEEHIIV_API_KEY && env.BEEHIIV_PUBLICATION_ID
        ? () =>
            new BeehiivNewsletterProvider(
              env.BEEHIIV_API_KEY ?? '',
              env.BEEHIIV_PUBLICATION_ID ?? '',
              env.BEEHIIV_SEND_WELCOME_EMAIL === 'true',
            )
        : undefined,
  }
}

function get(name: NewsletterProviderName): NewsletterProvider {
  const { newsletterProviderRegistry } = getServerContext()
  const factory = newsletterProviderRegistry?.[name]
  if (!factory) throw new Error(`Newsletter provider 未注册：${name}`)
  return factory()
}

export async function subscribe(name: NewsletterProviderName, params: SubscribeNewsletterParams) {
  const result = await get(name).subscribe(params)
  await deleteCache(createCacheKey('newsletter:status', params.email))
  return result
}

export async function unsubscribe(
  name: NewsletterProviderName,
  params: UnsubscribeNewsletterParams,
) {
  const result = await get(name).unsubscribe(params)
  await deleteCache(createCacheKey('newsletter:status', params.email))
  return result
}

export async function checkStatus(
  name: NewsletterProviderName,
  params: CheckSubscribeStatusParams,
) {
  return getOrSetCache<boolean>({
    key: createCacheKey('newsletter:status', params.email),
    ttlSeconds: CACHE_TTL.newsletterStatus,
    fetcher: () => get(name).checkSubscribeStatus(params),
  })
}

const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_MAX_UNKNOWN = 1

async function getCacheProvider() {
  const { cacheProvider } = getServerContext()
  return cacheProvider
}

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
export async function checkRateLimit(
  ip: string,
  action: 'subscribe' | 'unsubscribe',
): Promise<boolean> {
  const cacheProvider = await getCacheProvider()
  const key = createCacheKey('newsletter:ratelimit', ip, action)

  // Fail closed — deny when cache is unavailable
  if (!cacheProvider) {
    return false
  }

  const isUnknown = ip === 'unknown'
  const maxRequests = isUnknown ? RATE_LIMIT_MAX_UNKNOWN : RATE_LIMIT_MAX

  const raw = await cacheProvider.get<number[]>(key)
  const now = Date.now()
  // Timestamps strictly within the window
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000
  const timestamps: number[] = raw !== null ? raw.filter((t) => now - t < windowMs) : []

  if (timestamps.length >= maxRequests) {
    return false
  }

  timestamps.push(now)
  await cacheProvider.set(key, timestamps, RATE_LIMIT_WINDOW_SECONDS)
  return true
}

export { BeehiivNewsletterProvider } from './provider/beehiiv'
export { ResendNewsletterProvider } from './provider/resend'
export type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
}
