import type { CtaProps, FaqProps, FeaturesProps, HeroProps } from '@/components/sections'
import { m } from '@/locale/paraglide/messages.js'

export const featuresBlocks = {
  Hero: {
    title: m.features_hero_title(),
    subtitle: m.features_hero_subtitle(),
  } satisfies HeroProps,
  Features: {
    title: m.features_section_title(),
    items: [
      { title: m.feature_auth_title(), description: m.feature_auth_description() },
      { title: m.feature_payment_title(), description: m.feature_payment_description() },
      { title: m.feature_storage_title(), description: m.feature_storage_description() },
      { title: m.feature_email_title(), description: m.feature_email_description() },
      { title: m.feature_newsletter_title(), description: m.feature_newsletter_description() },
      { title: m.feature_notification_title(), description: m.feature_notification_description() },
    ],
  } satisfies FeaturesProps,
  Faq: {
    title: m.features_faq_title(),
    items: [
      { question: m.features_faq_q1(), answer: m.features_faq_a1() },
      { question: m.features_faq_q2(), answer: m.features_faq_a2() },
    ],
  } satisfies FaqProps,
  Cta: {
    title: m.features_cta_title(),
    primaryCta: { label: m.features_cta_primary(), href: '/pricing' },
  } satisfies CtaProps,
}
