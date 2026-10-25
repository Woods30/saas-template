import type { Locale } from '@/config/locale'
import { resolveLookupKey } from '@/config/products'
import { websiteConfig } from '@/config/website'
import type { PricingInterval } from '@/types/pricing'

/**
 * 浏览器端发起结账：POST `/api/payment` → 整页跳转到 Stripe Checkout。
 *
 * 只传 **产品 id + 计费周期**，不传 Price id：价格由服务端按 `lookup_key` 解析。
 * 好处有两层——改价不必改前端；客户端也指定不了别的价格。
 *
 * 用整页跳转而非 `window.open`：Checkout 完成后要回到本站 success_url，新标签页会让
 * 用户落在原标签的旧页面上。
 *
 * 各 outcome 对应不同后续动作：未登录跳注册页、未配置 Price 应禁用按钮、
 * 已有互斥订阅（409）应提示去「管理订阅」换方案。
 */

export type CheckoutOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'unauthenticated' }
  | { kind: 'not-configured' }
  /** 同一个产品已经有方案了（换周期走「管理订阅」）。 */
  | { kind: 'already-subscribed' }
  /** 已经持有更高等级的方案，不必再买低级的。 */
  | { kind: 'already-higher-tier' }
  /** 与已购方案显式互斥，不能同时持有。 */
  | { kind: 'exclusive-product' }
  | { kind: 'error'; message: string }

export interface StartCheckoutParams {
  /** 本站产品 id（如 `pro`）。 */
  productId: string
  /** 计费周期；买断传 `one_time`。 */
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
  // 未配置 lookup key 就别发请求：直接给「先注册」更贴近真实可做的事。
  if (!resolveLookupKey(params.productId, params.interval)) {
    return { kind: 'not-configured' }
  }

  const { successUrl, cancelUrl } = returnUrls(params.locale)

  let response: Response
  try {
    response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: params.productId,
        interval: params.interval,
        successUrl,
        cancelUrl,
        locale: params.locale,
      }),
    })
  } catch {
    return { kind: 'error', message: 'network' }
  }

  if (response.status === 401) return { kind: 'unauthenticated' }
  // 409 是服务端的归属守卫。三种原因要分开：同一个产品已有方案（去「管理订阅」
  // 换周期）、已有更高等级（不用再买）、显式互斥（不能并存）——提示不同。
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    switch (body?.error) {
      case 'ALREADY_OWNED_HIGHER_TIER':
        return { kind: 'already-higher-tier' }
      case 'ALREADY_OWNED_EXCLUSIVE_PRODUCT':
        return { kind: 'exclusive-product' }
      // `ALREADY_SUBSCRIBED` 与「查不出已有方案属于哪个产品」都归到这一条：
      // 用户看到的是同一件事——你已经有订阅了，去「管理订阅」处理。
      default:
        return { kind: 'already-subscribed' }
    }
  }
  if (!response.ok) {
    // 不回显服务端错误体：它可能包含内部路径。
    return { kind: 'error', message: `http_${response.status}` }
  }

  const body = (await response.json().catch(() => null)) as { url?: string } | null
  if (!body?.url) return { kind: 'error', message: 'missing_url' }

  return { kind: 'redirect', url: body.url }
}

/** 该产品的这个付费方式是否已配置可购买的价格（用于禁用按钮）。 */
export function isCheckoutConfigured(productId: string, interval?: PricingInterval): boolean {
  return Boolean(resolveLookupKey(productId, interval))
}
