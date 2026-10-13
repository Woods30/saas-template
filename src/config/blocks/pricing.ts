import type { CtaProps, HeroProps } from '@/components/blocks/marketing'
import type { PricingPlan } from '@/components/blocks/marketing/pricing'
import { m } from '@/locale/paraglide/messages.js'

export const pricingPlans: PricingPlan[] = [
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
    prices: [{ amount: 1900, currency: 'USD', interval: 'month', label: m.pricing_per_month() }],
    features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
    cta: { label: m.pricing_pro_cta(), href: '/auth/register?plan=pro' },
    highlighted: true,
    badge: m.pricing_recommended(),
  },
  {
    id: 'lifetime',
    name: m.pricing_lifetime_name(),
    description: m.pricing_lifetime_description(),
    prices: [{ amount: 29900, currency: 'USD', interval: 'one_time', label: m.pricing_one_time() }],
    features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
    cta: { label: m.pricing_lifetime_cta(), href: '/auth/register?plan=lifetime' },
  },
]

export const pricingBlocks = {
  Hero: {
    title: m.pricing_hero_title(),
    subtitle: m.pricing_hero_subtitle(),
  } satisfies HeroProps,
  Cta: {
    title: m.pricing_cta_title(),
    primaryCta: { label: m.pricing_cta_primary(), href: '/auth/register' },
  } satisfies CtaProps,
}
