import { useState } from 'react'
import { websiteConfig } from '@/config/website'
import { formatUsdAmount } from '@/core/payment/price-catalog'
import { formatMoney } from '@/lib/format'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { Cta } from './cta'
import { Faq } from './faq'
import { LandingBrandStory } from './landing-brand-story'
import { LandingCapabilities } from './landing-capabilities'
import { LandingHero } from './landing-hero'
import { LandingStack } from './landing-stack'
import { LandingTechnologyStrip } from './landing-technology-strip'
import { LandingValueProps } from './landing-value-props'
import { LandingWorkflow } from './landing-workflow'
import { type ManualPaymentPriceView, TemplatePricing } from './template-pricing'

/** 营销首页：按顺序组合各区块。 */
export function LandingPage({
  priceCents,
  manualPaymentPrice = null,
}: {
  priceCents: number | null
  /** 核销链路的本地标价；只在结账链路为核销收款时用。 */
  manualPaymentPrice?: ManualPaymentPriceView | null
}) {
  const [motionRunning, setMotionRunning] = useState(true)
  const locale = getLocale()
  // 价格事实源随结账链路走：渠道支付读 Stripe 的价格目录，核销收款读本地标价。
  // 取不到时降级为「价格暂不可用」，不编造金额。
  const manualPaymentMode = websiteConfig.payment.checkoutMode === 'manual_payments'
  const price = manualPaymentMode
    ? manualPaymentPrice
      ? formatMoney(manualPaymentPrice.amount, manualPaymentPrice.currency, locale)
      : null
    : priceCents === null
      ? null
      : formatUsdAmount(priceCents)
  return (
    <div className="landing-lab" data-motion={motionRunning ? 'running' : 'paused'}>
      <LandingHero price={price} onMotionChange={setMotionRunning} />
      <LandingValueProps />
      <LandingTechnologyStrip />
      <section id="features" className="scroll-mt-16">
        <LandingCapabilities />
      </section>
      <LandingStack />
      <LandingWorkflow />
      <TemplatePricing price={price} />
      <LandingBrandStory />
      <section id="faq" className="scroll-mt-16">
        <Faq
          title={m.home_faq_title()}
          variant="split"
          items={[
            { question: m.home_faq_q1(), answer: m.home_faq_a1() },
            { question: m.home_faq_q2(), answer: m.home_faq_a2() },
            { question: m.home_faq_q3(), answer: m.home_faq_a3() },
            { question: m.home_faq_q4(), answer: m.home_faq_a4() },
            { question: m.home_faq_q5(), answer: m.home_faq_a5() },
          ]}
        />
      </section>
      <Cta
        title={m.home_cta_title()}
        description={m.home_cta_description()}
        primaryCta={{ label: m.home_cta_primary(), href: '#pricing' }}
        variant="quiet"
      />
    </div>
  )
}
