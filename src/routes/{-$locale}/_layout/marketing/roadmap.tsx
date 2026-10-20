import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Roadmap } from '@/components/blocks/marketing'
import { roadmapBlocks } from '@/config/blocks'
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
      <Hero {...roadmapBlocks.Hero} />
      <Roadmap {...roadmapBlocks.Roadmap} />
      <Cta {...roadmapBlocks.Cta} />
    </>
  )
}
