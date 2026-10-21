import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Features, Hero } from '@/components/sections'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/features')({
  head: () =>
    seo('/marketing/features', {
      title: m.features_page_title(),
      description: m.features_page_description(),
      locale: getLocale(),
    }),
  component: FeaturesPage,
})

function FeaturesPage() {
  return (
    <>
      <Hero title={m.features_hero_title()} subtitle={m.features_hero_subtitle()} />
      <Features
        title={m.features_section_title()}
        items={[
          { title: m.feature_auth_title(), description: m.feature_auth_description() },
          { title: m.feature_payment_title(), description: m.feature_payment_description() },
          { title: m.feature_storage_title(), description: m.feature_storage_description() },
          { title: m.feature_email_title(), description: m.feature_email_description() },
          {
            title: m.feature_newsletter_title(),
            description: m.feature_newsletter_description(),
          },
          {
            title: m.feature_notification_title(),
            description: m.feature_notification_description(),
          },
        ]}
      />
      <Faq
        title={m.features_faq_title()}
        items={[
          { question: m.features_faq_q1(), answer: m.features_faq_a1() },
          { question: m.features_faq_q2(), answer: m.features_faq_a2() },
        ]}
      />
      <Cta
        title={m.features_cta_title()}
        primaryCta={{ label: m.features_cta_primary(), href: '/pricing' }}
      />
    </>
  )
}
