import type { Locale } from '@/config/locale'
import { resolvePriceReference } from '@/config/products'
import { websiteConfig } from '@/config/website'

export type CheckoutOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'unauthenticated' }
  | { kind: 'not-configured' }
  | { kind: 'already-subscribed' }
  | { kind: 'error'; message: string }
export interface StartCheckoutParams {
  productId: string
  offerId: string
  locale: Locale
}

export async function startCheckout(params: StartCheckoutParams): Promise<CheckoutOutcome> {
  if (!resolvePriceReference(params.productId, params.offerId)) return { kind: 'not-configured' }
  const base = websiteConfig.baseUrl.replace(/\/$/, '')
  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...params,
        successUrl: `${base}/${params.locale}/dashboard/billing?checkout=success`,
        cancelUrl:
          params.productId === websiteConfig.template.productId
            ? `${base}/${params.locale}/#pricing`
            : `${base}/${params.locale}/pricing?checkout=cancelled`,
      }),
    })
    if (response.status === 401) return { kind: 'unauthenticated' }
    if (response.status === 409) {
      const body = (await response.json()) as { error?: string }
      return body.error === 'CHECKOUT_PENDING'
        ? { kind: 'error', message: 'checkout_pending' }
        : { kind: 'already-subscribed' }
    }
    if (response.status === 400) {
      // 400 有多个来源：只有价格不可用才说「暂未开放购买」。
      // 其余（参数非法、回跳地址不被信任）报通用错误，否则用户会被引向错误方向。
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      return body?.error === 'PRICE_UNAVAILABLE'
        ? { kind: 'not-configured' }
        : { kind: 'error', message: 'invalid_checkout' }
    }
    if (!response.ok) return { kind: 'error', message: `http_${response.status}` }
    const body = (await response.json()) as { url?: string }
    return body.url
      ? { kind: 'redirect', url: body.url }
      : { kind: 'error', message: 'missing_url' }
  } catch {
    return { kind: 'error', message: 'network' }
  }
}
