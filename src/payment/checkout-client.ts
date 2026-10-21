import type { Locale } from '@/config/locale'
import { resolveMode, resolvePriceId } from '@/config/payment'
import { websiteConfig } from '@/config/website'

/**
 * 浏览器端发起结账：解析 Price ID → POST `/api/payment` → 整页跳转到 Stripe Checkout。
 *
 * 用整页跳转而非 `window.open`：Checkout 完成后要回到本站 success_url，新标签页会让
 * 用户落在原标签的旧页面上。
 *
 * 各 outcome 对应不同后续动作：未登录跳注册页、未配置 Price 应禁用按钮、
 * 已有订阅（409）应提示去「管理订阅」换方案。
 */

export type CheckoutOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'unauthenticated' }
  | { kind: 'not-configured' }
  | { kind: 'already-subscribed' }
  | { kind: 'error'; message: string }

export interface StartCheckoutParams {
  planId: string
  /** 计费周期；一次性方案传 `one_time`。 */
  interval?: 'month' | 'year' | 'one_time'
  locale: Locale
}

/** 结账成功后回到工作台的账单页；取消则回定价页。 */
function returnUrls(locale: Locale): { successUrl: string; cancelUrl: string } {
  const base = websiteConfig.baseUrl.replace(/\/$/, '')
  const prefix = locale ? `/${locale}` : ''
  return {
    successUrl: `${base}${prefix}/dashboard/billing?checkout=success`,
    cancelUrl: `${base}${prefix}/pricing?checkout=cancelled`,
  }
}

export async function startCheckout(params: StartCheckoutParams): Promise<CheckoutOutcome> {
  const priceId = resolvePriceId(websiteConfig.payment.priceMap, params.planId, params.interval)
  if (!priceId) return { kind: 'not-configured' }

  const { successUrl, cancelUrl } = returnUrls(params.locale)

  let response: Response
  try {
    response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId,
        successUrl,
        cancelUrl,
        mode: resolveMode(params.planId, websiteConfig.payment.priceMap),
        locale: params.locale,
      }),
    })
  } catch {
    return { kind: 'error', message: 'network' }
  }

  if (response.status === 401) return { kind: 'unauthenticated' }
  // 409 是服务端的重复订阅守卫，单独成 outcome 以便调用方给出明确提示。
  if (response.status === 409) return { kind: 'already-subscribed' }
  if (!response.ok) {
    // 不回显服务端错误体：它可能包含内部路径。
    return { kind: 'error', message: `http_${response.status}` }
  }

  const body = (await response.json().catch(() => null)) as { url?: string } | null
  if (!body?.url) return { kind: 'error', message: 'missing_url' }

  return { kind: 'redirect', url: body.url }
}

/** 该 plan 是否已配置可购买的 Price（用于禁用按钮）。 */
export function isCheckoutConfigured(planId: string, interval?: string): boolean {
  return Boolean(resolvePriceId(websiteConfig.payment.priceMap, planId, interval))
}
