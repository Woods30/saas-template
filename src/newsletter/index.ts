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

export { BeehiivNewsletterProvider } from './provider/beehiiv'
export { ResendNewsletterProvider } from './provider/resend'
export type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
}
