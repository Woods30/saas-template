import { createFileRoute } from '@tanstack/react-router'
import { Cta, Features, Hero, Stats, Testimonials } from '@/components/blocks/marketing'
import { homeBlocks } from '@/config/blocks'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/')({
  head: () => seo('/', { title: m.site_name(), description: m.site_description() }),
  component: HomePage,
})

function HomePage() {
  return (
    <>
      <Hero {...homeBlocks.Hero} />
      <Stats {...homeBlocks.Stats} />
      <Features {...homeBlocks.Features} />
      <Testimonials {...homeBlocks.Testimonials} />
      <Cta {...homeBlocks.Cta} />
    </>
  )
}
