import type { CtaProps, HeroProps } from '@/components/blocks/marketing'
import type { PricingPlan } from '@/components/blocks/marketing/pricing'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 定价方案。
 *
 * `prices` 是**展示**数据：页面上的金额与周期说明。真正用于结账的是
 * `VITE_STRIPE_PRICE_*` 派生的 `priceMap`（`src/config/payment.ts`）——两者是
 * 故意分开的，展示价写死在这里，实际扣款价由 Stripe 决定，不会因为改了文案就
 * 收错钱。
 *
 * 因此这里的金额与 Stripe 后台的 Price 必须由人保持一致：`pro_monthly` 的 `year`
 * 项只是让页面出现「按年付」选项，选中后提交的是 `VITE_STRIPE_PRICE_PRO_YEARLY`
 * 指向的那个 Price。
 *
 * 一个 plan 有多个周期时，定价页顶部出现月付 / 年付切换器，默认落在第一个周期上。
 *
 * ## 为什么是工厂函数而不是常量
 *
 * 文案含 `m.*()` 调用，而 `m` 读的是**运行时** locale。写成模块级常量时，整个
 * 数组只在 import 那一刻求值一次，之后切换语言不会跟着变——SSR 下还会把首次
 * 请求的语言固化给所有后续请求。改成函数后每次渲染重新求值，与 `homeBlocks`
 * 的 getter 是同一个理由。
 */
export function getPricingPlans(): PricingPlan[] {
  return [
    {
      id: 'free',
      name: m.pricing_free_name(),
      description: m.pricing_free_description(),
      prices: [],
      features: [m.pricing_free_feature_1(), m.pricing_free_feature_2()],
      cta: { label: m.pricing_free_cta(), href: '/auth/register' },
    },
    {
      id: 'pro_monthly',
      name: m.pricing_pro_name(),
      description: m.pricing_pro_description(),
      prices: [
        { amount: 599, currency: 'USD', interval: 'month', label: m.pricing_per_month() },
        { amount: 28100, currency: 'USD', interval: 'year', label: m.pricing_per_year() },
      ],
      features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
      cta: { label: m.pricing_pro_cta(), href: '/auth/register?plan=pro' },
      highlighted: true,
      badge: m.pricing_recommended(),
    },
    {
      id: 'lifetime',
      name: m.pricing_lifetime_name(),
      description: m.pricing_lifetime_description(),
      prices: [
        { amount: 1400, currency: 'USD', interval: 'one_time', label: m.pricing_one_time() },
      ],
      features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
      cta: { label: m.pricing_lifetime_cta(), href: '/auth/register?plan=lifetime' },
    },
  ]
}

/**
 * 页面级文案块。
 *
 * 与 `homeBlocks` 同理用 getter：`m.*()` 读运行时 locale，写成普通字段会在 import
 * 那一刻把首次请求的语言固化给所有后续请求——SSR 下表现为偶尔整个页面语言不对，
 * 客户端还会报 hydration mismatch。
 */
export const pricingBlocks = {
  get Hero() {
    return {
      title: m.pricing_hero_title(),
      subtitle: m.pricing_hero_subtitle(),
    } satisfies HeroProps
  },
  get Cta() {
    return {
      title: m.pricing_cta_title(),
      primaryCta: { label: m.pricing_cta_primary(), href: '/auth/register' },
    } satisfies CtaProps
  },
}
