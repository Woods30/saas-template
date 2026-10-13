import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Features, Hero } from '@/components/blocks/marketing'
import { featuresBlocks } from '@/config/blocks'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/features')({
  head: () =>
    seo('/features', {
      title: m.features_page_title(),
      description: m.features_page_description(),
    }),
  component: FeaturesPage,
})

function FeaturesPage() {
  return (
    <>
      <Hero {...featuresBlocks.Hero} />
      <Features {...featuresBlocks.Features} />
      <Faq {...featuresBlocks.Faq} />
      <Cta {...featuresBlocks.Cta} />
    </>
  )
}
