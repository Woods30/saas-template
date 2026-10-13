import type { CtaProps, HeroProps, StatsProps } from '@/components/blocks/marketing'
import { m } from '@/locale/paraglide/messages.js'

export const aboutBlocks = {
  Hero: {
    title: m.about_hero_title(),
    subtitle: m.about_hero_subtitle(),
  } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: m.about_stat_modules() },
      { value: '4+', label: m.about_stat_providers() },
      { value: 'zh/en', label: m.about_stat_i18n() },
    ],
  } satisfies StatsProps,
  Cta: {
    title: m.about_cta_title(),
    primaryCta: { label: m.about_cta_primary(), href: '/docs' },
  } satisfies CtaProps,
}
