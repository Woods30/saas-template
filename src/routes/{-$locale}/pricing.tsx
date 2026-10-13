import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero } from '@/components/blocks/marketing'
import { Pricing as PricingBlock } from '@/components/blocks/marketing/pricing'
import { pricingBlocks, pricingPlans } from '@/config/blocks'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/pricing')({
  head: () =>
    seo('/pricing', {
      title: m.pricing_page_title(),
      description: m.pricing_page_description(),
      locale: getLocale(),
    }),
  component: PricingPage,
})

function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero {...pricingBlocks.Hero} />
      <PricingBlock plans={pricingPlans} />
      <Cta {...pricingBlocks.Cta} />
    </main>
  )
}
