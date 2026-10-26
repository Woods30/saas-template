import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Roadmap } from '@/components/sections'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/roadmap')({
  head: () =>
    seo('/marketing/roadmap', {
      title: m.roadmap_page_title(),
      description: m.roadmap_page_description(),
      locale: getRequestLocale(),
      pageType: 'WebPage',
    }),
  component: RoadmapPage,
})

function RoadmapPage() {
  return (
    <>
      <Hero title={m.roadmap_hero_title()} subtitle={m.roadmap_hero_subtitle()} align="center" />
      <Roadmap
        title={m.roadmap_hero_title()}
        items={[
          {
            status: 'done',
            title: m.feature_auth_title(),
            description: m.feature_auth_description(),
          },
          {
            status: 'done',
            title: m.feature_payment_title(),
            description: m.feature_payment_description(),
          },
          {
            status: 'active',
            title: m.feature_notification_title(),
            description: m.feature_notification_description(),
          },
          {
            status: 'planned',
            title: m.feature_storage_title(),
            description: m.feature_storage_description(),
          },
        ]}
      />
      <Cta
        title={m.roadmap_cta_title()}
        variant="quiet"
        primaryCta={{ label: m.roadmap_cta_primary(), href: '/docs' }}
      />
    </>
  )
}
