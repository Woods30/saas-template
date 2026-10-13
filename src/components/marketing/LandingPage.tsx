import { Cta, Faq, Features, Hero, Stats, Testimonials } from '@/components/blocks/marketing'
import { Pricing } from '@/components/blocks/marketing/pricing'
import { featuresBlocks, homeBlocks, pricingPlans } from '@/config/blocks'

/**
 * Landing 单页：把营销区块顺序排布在同一页面内，特性 / 价格 / FAQ 作为锚点区段，
 * 供 Navbar 平滑滚动定位（见 `globals.css` 的 `scroll-behavior`）。
 *
 * `scroll-mt-16` 抵消 sticky Navbar 的 `h-16`，避免锚点落点被导航栏遮挡。
 * 独立子页面（`/pricing`、`/marketing/features` 等）仍然保留，此组件不取代它们。
 */
export function LandingPage() {
  return (
    <>
      <Hero {...homeBlocks.Hero} />
      <Stats {...homeBlocks.Stats} />
      <section id="features" className="scroll-mt-16">
        <Features {...homeBlocks.Features} />
      </section>
      <section id="pricing" className="scroll-mt-16">
        <Pricing plans={pricingPlans} />
      </section>
      <section id="faq" className="scroll-mt-16">
        <Faq {...featuresBlocks.Faq} />
      </section>
      <Testimonials {...homeBlocks.Testimonials} />
      <Cta {...homeBlocks.Cta} />
    </>
  )
}
