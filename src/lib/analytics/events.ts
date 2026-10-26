import { track } from '@/lib/analytics'

/**
 * 业务事件埋点。
 *
 * 事件名是**对外契约**（分析平台数据结构、漏斗报表都依赖），故集中声明，
 * 调用处不得写字面量。
 *
 * 事件参数只放**非 PII**：id、枚举、布尔。分析数据落在第三方，传 PII 会同时
 * 违反 GDPR 与平台服务条款。
 */

/** 平台无关的事件名集合。新增事件在此声明，调用处不得写字面量。 */
export const ANALYTICS_EVENTS = {
  /** 注册成功（不论是否要求邮箱验证）。 */
  signUp: 'sign_up',
  /** 登录成功。 */
  login: 'login',
  /** 点击定价页 CTA，发起结账。 */
  beginCheckout: 'begin_checkout',
  /** Stripe Checkout 完成，回到本站。 */
  purchase: 'purchase',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

/** 埋点统一入口。仅在浏览器端生效，静默失败，不抛错。 */
export function trackEvent(
  name: AnalyticsEventName,
  params?: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return
  track({ name, params })
}

export function trackSignUp(): void {
  trackEvent(ANALYTICS_EVENTS.signUp)
}

export function trackLogin(): void {
  trackEvent(ANALYTICS_EVENTS.login)
}

export function trackBeginCheckout(params: {
  productId: string
  mode: 'subscription' | 'payment'
}) {
  trackEvent(ANALYTICS_EVENTS.beginCheckout, {
    product_id: params.productId,
    mode: params.mode,
  })
}

/** 支付完成。金额以**分**为单位，避免浮点误差。 */
export function trackPurchase(params: { productId: string; value: number; currency: string }) {
  trackEvent(ANALYTICS_EVENTS.purchase, {
    product_id: params.productId,
    value: params.value,
    currency: params.currency,
  })
}
