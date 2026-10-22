import { m } from '@/locale/paraglide/messages.js'
import type { PricingInterval, PricingPlanDefinition } from '@/types/pricing'

/**
 * 定价方案的**文案定义**：名称、卖点、CTA。
 *
 * 这里没有金额，也不决定「有哪些计费周期」：
 * - 金额来自 Stripe（`lookup_key` → Prices API），见 `src/payment/price-catalog.ts`；
 * - 有哪些周期来自 `lookup_key` 映射（env），见 `src/config/payment.ts`。
 *
 * 三者分工明确：改文案不碰钱，改价不碰文案。
 *
 * 用工厂函数而非常量：`m.*()` 读运行时 locale，模块级常量会把首次请求的语言固化给
 * 所有后续请求（SSR 下表现为整页语言不对 + hydration mismatch）。
 */
export function getPricingPlans(): PricingPlanDefinition[] {
  return [
    {
      id: 'free',
      name: m.pricing_free_name(),
      description: m.pricing_free_description(),
      features: [m.pricing_free_feature_1(), m.pricing_free_feature_2()],
      cta: { label: m.pricing_free_cta(), href: '/auth/register' },
    },
    {
      id: 'pro_monthly',
      name: m.pricing_pro_name(),
      description: m.pricing_pro_description(),
      features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
      cta: { label: m.pricing_pro_cta(), href: '/auth/register?plan=pro' },
      highlighted: true,
      badge: m.pricing_recommended(),
    },
    {
      id: 'lifetime',
      name: m.pricing_lifetime_name(),
      description: m.pricing_lifetime_description(),
      features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
      cta: { label: m.pricing_lifetime_cta(), href: '/auth/register?plan=lifetime' },
    },
  ]
}

/** 计费周期的展示文案（价格旁的「每月」「按年付」）。 */
export function pricingIntervalLabel(interval: PricingInterval): string {
  switch (interval) {
    case 'month':
      return m.pricing_per_month()
    case 'year':
      return m.pricing_per_year()
    case 'one_time':
      return m.pricing_one_time()
    default:
      return ''
  }
}
