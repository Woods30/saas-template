import type {
  CtaProps,
  FeaturesProps,
  HeroProps,
  StatsProps,
  TestimonialsProps,
} from '@/components/blocks/marketing'
import { m } from '@/locale/paraglide/messages.js'

export const homeBlocks = {
  Hero: {
    title: m.home_hero_title(),
    subtitle: m.home_hero_subtitle(),
    description: m.home_hero_description(),
    primaryCta: { label: m.home_hero_primary_cta(), href: '/auth/register' },
    secondaryCta: { label: m.home_hero_secondary_cta(), href: '/pricing' },
    align: 'center' as const,
  } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: m.home_stats_modules() },
      { value: '< 100ms', label: m.home_stats_latency() },
      { value: '0', label: m.home_stats_cold_start() },
      { value: '$0', label: m.home_stats_free_tier() },
    ],
  } satisfies StatsProps,
  Features: {
    title: m.home_features_title(),
    columns: 3 as const,
    items: [
      { title: m.home_features_edge_title(), description: m.home_features_edge_description() },
      {
        title: m.home_features_payment_title(),
        description: m.home_features_payment_description(),
      },
      { title: m.home_features_auth_title(), description: m.home_features_auth_description() },
      {
        title: m.home_features_storage_title(),
        description: m.home_features_storage_description(),
      },
      { title: m.home_features_email_title(), description: m.home_features_email_description() },
      { title: m.home_features_i18n_title(), description: m.home_features_i18n_description() },
    ],
  } satisfies FeaturesProps,
  Testimonials: {
    title: m.home_testimonials_title(),
    items: [
      { quote: m.home_testimonial_1_quote(), author: m.home_testimonial_1_author() },
      { quote: m.home_testimonial_2_quote(), author: m.home_testimonial_2_author() },
      { quote: m.home_testimonial_3_quote(), author: m.home_testimonial_3_author() },
    ],
  } satisfies TestimonialsProps,
  Cta: {
    title: m.home_cta_title(),
    description: m.home_cta_description(),
    primaryCta: { label: m.home_cta_primary(), href: '/auth/register' },
  } satisfies CtaProps,
}
