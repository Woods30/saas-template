import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Cta, Hero } from '@/components/blocks/marketing'
import { Pricing as PricingBlock } from '@/components/blocks/marketing/pricing'
import { Button } from '@/components/ui/button'
import { pricingBlocks, pricingPlans } from '@/config/blocks'
import { isPlanPurchasable } from '@/config/payment'
import { websiteConfig } from '@/config/website'
import { trackBeginCheckout } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { startCheckout } from '@/payment/checkout-client'

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

/**
 * 定价页。
 *
 * CTA 行为由**是否配置了 Price ID** 决定，而不是只由 `payment.enabled`：
 *
 * - 未登录 → 引导注册，并把 `?plan=<id>` 带上（注册后可回到原方案）；
 * - 已登录且该 plan 有 Price → 调 `/api/payment` 拿 Stripe Checkout URL 后整页跳转；
 * - 已登录但没配 Price（模板开箱状态）→ 仍引导注册。**不能**给一个点了就 502 的
 *   按钮，也不该在没配置时暗示「立即购买」。
 *
 * 未配置时按钮文字保持「免费开始 / 注册」，配齐之后组件自动换成「选择专业版」的
 * 结账语义——页面结构与文案不需要为了结账改造两套。
 */
function PricingPage() {
  const router = useRouter()
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)

  async function onSelectPlan(planId: string) {
    const plan = pricingPlans.find((p) => p.id === planId)
    const interval = plan?.prices[0]?.interval === 'one_time' ? 'one_time' : 'month'
    const locale = getLocale()

    // 没有该 plan 的 Price：走注册引导，不发起结账。
    if (!isPlanPurchasable(planId, websiteConfig.payment.priceMap)) {
      router.navigate({
        to: '/{-$locale}/auth/register',
        params: { locale },
        search: { plan: planId },
      })
      return
    }

    setPendingPlanId(planId)
    try {
      const outcome = await startCheckout({ planId, interval, locale })
      switch (outcome.kind) {
        case 'redirect':
          // 埋点在跳转之前发：结账意图已经成立，是否付成功由 purchase 事件记录。
          trackBeginCheckout({ planId, mode: interval === 'one_time' ? 'payment' : 'subscription' })
          window.location.assign(outcome.url)
          return
        case 'unauthenticated':
          router.navigate({
            to: '/{-$locale}/auth/login',
            params: { locale },
            search: { redirect: '/pricing' },
          })
          return
        default:
          // 配置缺失或网络 / 服务端错误：退回注册引导，比停在按钮加载态更好。
          router.navigate({
            to: '/{-$locale}/auth/register',
            params: { locale },
            search: { plan: planId },
          })
      }
    } finally {
      setPendingPlanId(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero {...pricingBlocks.Hero} />
      <PricingBlock
        plans={pricingPlans}
        renderCta={(plan) => {
          const configured = isPlanPurchasable(plan.id, websiteConfig.payment.priceMap)
          const pending = pendingPlanId === plan.id
          return (
            <Button className="w-full" disabled={pending} onClick={() => onSelectPlan(plan.id)}>
              {pending
                ? m.payment_checkout_redirecting()
                : configured
                  ? plan.cta.label
                  : m.pricing_free_cta()}
            </Button>
          )
        }}
      />
      <Cta {...pricingBlocks.Cta} />
      {/* 未配置 Price 时给一条明确线索：这个模板默认不带支付凭据。 */}
      {!hasAnyConfiguredPrice() && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {m.payment_checkout_not_configured()}
        </p>
      )}
    </main>
  )
}

/** 任一 plan 配了 Price 才隐藏「暂未开放购买」的提示。 */
function hasAnyConfiguredPrice(): boolean {
  return pricingPlans.some((plan) => isPlanPurchasable(plan.id, websiteConfig.payment.priceMap))
}
