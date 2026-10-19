import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Cta, Hero } from '@/components/blocks/marketing'
import { Pricing as PricingBlock } from '@/components/blocks/marketing/pricing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getPricingPlans, pricingBlocks } from '@/config/blocks'
import { availableIntervals, isPlanPurchasable } from '@/config/payment'
import { websiteConfig } from '@/config/website'
import { trackBeginCheckout } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { resolveRedirectTarget } from '@/lib/urls'
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
 * 周期切换的默认值：`pro_monthly` 第一个配好 Price 的周期。
 *
 * 在模块加载期求值即可：它只依赖 `websiteConfig.payment.priceMap`（来自 env，进程
 * 生命周期内不变），不含随请求变化的 locale 文案——`getPricingPlans()` 才会。
 */
const defaultInterval: 'month' | 'year' | 'one_time' =
  availableIntervals(websiteConfig.payment.priceMap, 'pro_monthly')[0] ?? 'month'

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
 *
 * ## 月付 / 年付怎么配
 *
 * `pro_monthly` 一个 plan 下挂多个 Price（`priceMap.pro_monthly.month` 与 `.year`），
 * 页面据此渲染周期切换器，提交的是用户选中的那个 Price。没配年付时切换器里根本
 * 不出现「按年」——不会给一个点了就 502 的选项。
 *
 * `lifetime` 是 `one_time` Price，没有周期可选，切换器对它不显示。
 */
function PricingPage() {
  const router = useRouter()
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [notice, setNotice] = useState<'already-subscribed' | null>(null)
  const [interval, setInterval] = useState<'month' | 'year' | 'one_time'>(defaultInterval)

  async function onSelectPlan(planId: string) {
    // 一次性方案（lifetime）没有周期概念，直接走 one_time。
    const plan = getPricingPlans().find((p) => p.id === planId)
    const planInterval = plan?.prices[0]?.interval === 'one_time' ? 'one_time' : interval
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

    setNotice(null)
    setPendingPlanId(planId)
    try {
      const outcome = await startCheckout({ planId, interval: planInterval, locale })
      switch (outcome.kind) {
        case 'redirect':
          // 埋点在跳转之前发：结账意图已经成立，是否付成功由 purchase 事件记录。
          trackBeginCheckout({
            planId,
            mode: planInterval === 'one_time' ? 'payment' : 'subscription',
          })
          window.location.assign(outcome.url)
          return
        case 'unauthenticated':
          router.navigate({
            to: '/{-$locale}/auth/login',
            params: { locale },
            // 登录页的 `validateSearch` 只接受经过 `safeInternalPath` 的类型，
            // 因此这里传常量也要走一次——类型即文档。
            search: { redirect: resolveRedirectTarget('/pricing') },
          })
          return
        case 'already-subscribed':
          // 服务端挡下了重复订阅（409）。停留在定价页并说明原因，比让用户再付一次
          // 或被 Stripe 拒绝都更清楚。
          setNotice('already-subscribed')
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

  /** 可切换的周期；只有一个周期（或全都没配）时不渲染切换器。 */
  const proIntervals = availableIntervals(websiteConfig.payment.priceMap, 'pro_monthly')
  const showIntervalSwitch =
    proIntervals.length > 1 && proIntervals.some((value) => value !== 'one_time')

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero {...pricingBlocks.Hero} />
      {showIntervalSwitch && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <ToggleGroup
            value={[interval]}
            onValueChange={(value) => {
              const next = value[0]
              // 取消选中当前项时 Base UI 给空数组：不接受「没有周期」这个状态，
              // 保留当前值，否则用户点一下已选项就会丢掉选择。
              if (next) setInterval(next as 'month' | 'year')
            }}
            aria-label={m.pricing_switch_month()}
          >
            {proIntervals
              .filter((value) => value !== 'one_time')
              .map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {value === 'month' ? m.pricing_switch_month() : m.pricing_switch_year()}
                </ToggleGroupItem>
              ))}
          </ToggleGroup>
          {interval === 'year' && <YearlySavingHint />}
        </div>
      )}
      <PricingBlock
        plans={getPricingPlans()}
        selectedInterval={interval}
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
      {notice === 'already-subscribed' && (
        <p role="status" className="mt-6 text-center text-sm text-muted-foreground">
          {m.payment_already_subscribed()}
          <span className="mx-2" aria-hidden>
            ·
          </span>
          {m.payment_already_subscribed_hint()}
        </p>
      )}
      {/* 未配置 Price 时给一条明确线索：这个模板默认不带支付凭据。 */}
      {!hasAnyConfiguredPrice() && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {m.payment_checkout_not_configured()}
        </p>
      )}
    </main>
  )
}

/**
 * 年付相对月付的月度节省比例。
 *
 * 展示价（`pricingPlans`）与 Price 映射是两份数据，这里只能算展示价的折扣——
 * 真正收多少钱由 Stripe 决定。因此它是一条**营销文案**，不参与任何校验。
 */
function YearlySavingHint() {
  const pro = getPricingPlans().find((plan) => plan.id === 'pro_monthly')
  const month = pro?.prices.find((price) => price.interval === 'month')
  const year = pro?.prices.find((price) => price.interval === 'year')
  if (!month?.amount || !year?.amount) return null
  // 年付折算成月均价：`year / 12` 与月付价的差额百分比。
  const monthlyEquivalent = year.amount / 12
  const percent = Math.round((1 - monthlyEquivalent / month.amount) * 100)
  if (!Number.isFinite(percent) || percent <= 0) return null
  return (
    <p className="text-sm text-muted-foreground">
      <Badge variant="secondary" className="mr-2">
        -{percent}%
      </Badge>
      {m.pricing_yearly_hint({ percent })}
    </p>
  )
}

/** 任一 plan 配了 Price 才隐藏「暂未开放购买」的提示。 */
function hasAnyConfiguredPrice(): boolean {
  return getPricingPlans().some((plan) =>
    isPlanPurchasable(plan.id, websiteConfig.payment.priceMap),
  )
}
