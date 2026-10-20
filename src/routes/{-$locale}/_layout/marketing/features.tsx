import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Features, Hero } from '@/components/sections'
import { featuresBlocks } from '@/config/pages'
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
      <Hero {...featuresBlocks.Hero} />
      <Features {...featuresBlocks.Features} />
      <Faq {...featuresBlocks.Faq} />
      <Cta {...featuresBlocks.Cta} />
    </>
  )
}
