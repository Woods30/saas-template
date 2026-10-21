import { m } from '@/locale/paraglide/messages.js'
import type { PricingPlan } from '@/types/pricing'

/**
 * 定价方案。
 *
 * `prices` 只是**展示**数据，实际扣款价由 `priceMap`（`VITE_STRIPE_PRICE_*` 派生）决定，
 * 两者故意分开，改文案不会收错钱；因此这里的金额与 Stripe 后台的 Price 需人工保持一致。
 *
 * 用工厂函数而非常量：`m.*()` 读运行时 locale，模块级常量会把首次请求的语言固化给
 * 所有后续请求（SSR 下表现为整页语言不对 + hydration mismatch）。
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
