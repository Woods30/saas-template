import { CACHE_TTL, createCacheKey, deleteCache, getOrSetCache } from '@/cache'
import type { ServerEnv } from '@/env/server'
import { checkRateLimit as sharedCheckRateLimit } from '@/lib/rate-limit'
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

/** 归一化后 provider 所需的 server env 子集。 */
type NewsletterEnv = Pick<
  ServerEnv,
  | 'RESEND_API_KEY'
  | 'RESEND_AUDIENCE_ID'
  | 'BEEHIIV_API_KEY'
  | 'BEEHIIV_PUBLICATION_ID'
  | 'BEEHIIV_SEND_WELCOME_EMAIL'
>

/**
 * 按当前请求 env 构建 newsletter provider 注册表，在 `src/server.ts` 的 `als.run()` 中调用。
 * 只消费 `parseServerEnv` 归一化后的字段，避免未校验的原始 binding 进入 provider。
 */
export function buildNewsletterProviderRegistry(
  env: NewsletterEnv,
): Record<NewsletterProviderName, NewsletterProviderFactory | undefined> {
  const { RESEND_API_KEY, RESEND_AUDIENCE_ID, BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID } = env
  return {
    resend:
      RESEND_API_KEY && RESEND_AUDIENCE_ID
        ? () => new ResendNewsletterProvider(RESEND_API_KEY, RESEND_AUDIENCE_ID)
        : undefined,
    beehiiv:
      BEEHIIV_API_KEY && BEEHIIV_PUBLICATION_ID
        ? () =>
            new BeehiivNewsletterProvider(
              BEEHIIV_API_KEY,
              BEEHIIV_PUBLICATION_ID,
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

const NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS = 60
const NEWSLETTER_RATE_LIMIT_MAX = 5

export async function checkRateLimit(
  ip: string,
  action: 'subscribe' | 'unsubscribe',
): Promise<boolean> {
  return sharedCheckRateLimit({
    ip,
    action,
    limit: NEWSLETTER_RATE_LIMIT_MAX,
    windowSeconds: NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS,
    prefix: 'newsletter:ratelimit',
  })
}

export { BeehiivNewsletterProvider } from './provider/beehiiv'
export { ResendNewsletterProvider } from './provider/resend'
export type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
}
