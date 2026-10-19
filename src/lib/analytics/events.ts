import { track } from '@/lib/analytics'

/**
 * 业务事件埋点。
 *
 * 单独一层而不是在调用处直接写字符串：事件名是**对外契约**——四家分析平台的数据
 * 结构、后续漏斗报表都依赖它。散落成字面量时，改一个名字要全仓搜，还会出现
 * `sign_up` / `signup` 两套写法让数据对不上。
 *
 * 只收集中真正有决策价值的事件：注册、登录、发起结账、支付结果。凡是各家平台
 * 已经自动采集的（pageview、会话时长、跳出）在这里一律不重复发。
 *
 * 事件参数只放**非 PII**：id、枚举、布尔。邮箱 / 姓名 / IP 不进参数——分析平台
 * 的原始数据落在第三方，传 PII 会让 GDPR 与平台自身的服务条款同时出问题。
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

/** 埋点统一入口。所有调用都在浏览器端发生，静默失败即可，不向上抛错。 */
export function trackEvent(
  name: AnalyticsEventName,
  params?: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return
  track({ name, params })
}

/** 注册成功。 */
export function trackSignUp(): void {
  trackEvent(ANALYTICS_EVENTS.signUp)
}

/** 登录成功。 */
export function trackLogin(): void {
  trackEvent(ANALYTICS_EVENTS.login)
}

/** 发起结账。 */
export function trackBeginCheckout(params: { planId: string; mode: 'subscription' | 'payment' }) {
  trackEvent(ANALYTICS_EVENTS.beginCheckout, {
    plan_id: params.planId,
    mode: params.mode,
  })
}

/** 支付完成。金额以**分**为单位，避免浮点误差。 */
export function trackPurchase(params: { planId: string; value: number; currency: string }) {
  trackEvent(ANALYTICS_EVENTS.purchase, {
    plan_id: params.planId,
    value: params.value,
    currency: params.currency,
  })
}
