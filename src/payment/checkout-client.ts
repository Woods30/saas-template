import type { Locale } from '@/config/locale'
import { resolveMode, resolvePriceId } from '@/config/payment'
import { websiteConfig } from '@/config/website'

/**
 * 浏览器端发起结账。
 *
 * 定价页与工作台的「升级」按钮共用这一条路径：把 plan id 解析成 Price ID，向
 * `/api/payment` POST，拿到 Stripe Checkout 的 URL 后整页跳转。
 *
 * 为什么整页跳转而不是 `window.open`：Stripe Checkout 完成后需要回到本站的
 * success_url，新标签页会让用户落在原标签的旧页面上；整页跳转的返回路径最直观。
 *
 * 失败语义：
 * - 未登录 → 返回 `{ kind: 'unauthenticated' }`，由调用方跳注册页（并带上 plan，
 *   注册完成后可以继续结账）；
 * - 该 plan 没有配置 Price → `{ kind: 'not-configured' }`，调用方应禁用按钮而不是
 *   让用户点出一个 502；
 * - 已有生效中的订阅 → `{ kind: 'already-subscribed' }`（服务端 409）。调用方应
 *   提示去「管理订阅」里换方案，而不是让用户再走一遍结账；
 * - 其他 → `{ kind: 'error', message }`。
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
  // 409 是服务端的重复订阅守卫。单独识别成一个 outcome：调用方要给出「已有订阅」
  // 的明确提示，而不是一条通用错误——两者的下一步动作完全不同。
  if (response.status === 409) return { kind: 'already-subscribed' }
  if (!response.ok) {
    // 不回显服务端错误体：它可能包含内部路径；调用方用本地文案兜底。
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
