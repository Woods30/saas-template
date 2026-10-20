import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Stats } from '@/components/sections'
import { aboutBlocks } from '@/config/pages'
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
      <Hero {...aboutBlocks.Hero} />
      <Stats {...aboutBlocks.Stats} />
      <Cta {...aboutBlocks.Cta} />
    </>
  )
}
