import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero } from '@/components/blocks/marketing'
import { Pricing as PricingBlock } from '@/components/blocks/marketing/pricing'
import { pricingBlocks, pricingPlans } from '@/config/blocks'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/pricing')({
  // 独立定价页由 payment 开关控制；首页 #pricing 锚点不受影响。
  beforeLoad: () => assertPageEnabled('payment'),
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
