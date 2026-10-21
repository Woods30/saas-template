import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Stats } from '@/components/sections'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/about')({
  head: () =>
    seo('/marketing/about', {
      title: m.about_page_title(),
      description: m.about_page_description(),
      locale: getLocale(),
      pageType: 'AboutPage',
    }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <>
      <Hero title={m.about_hero_title()} subtitle={m.about_hero_subtitle()} />
      <Stats
        items={[
          { value: '7+', label: m.about_stat_modules() },
          { value: '4+', label: m.about_stat_providers() },
          { value: 'zh/en', label: m.about_stat_i18n() },
        ]}
      />
      <Cta
        title={m.about_cta_title()}
        primaryCta={{ label: m.about_cta_primary(), href: '/docs' }}
      />
    </>
  )
}
