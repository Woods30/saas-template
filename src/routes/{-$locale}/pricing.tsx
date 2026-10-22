import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchSession } from '@/auth/session'
import { Cta, Hero } from '@/components/sections'
import { Pricing as PricingBlock } from '@/components/sections/Pricing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { availableIntervals, isPlanPurchasable } from '@/config/payment'
import { getPricingPlans } from '@/config/pricing'
import { websiteConfig } from '@/config/website'
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'
import { trackBeginCheckout } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { resolveRedirectTarget } from '@/lib/urls'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { startCheckout } from '@/payment/checkout-client'
import { mergePricingPlans } from '@/payment/price-catalog'
import { fetchPriceCatalog } from '@/payment/pricing'

export const Route = createFileRoute('/{-$locale}/pricing')({
  // 独立定价页由 payment 开关控制；首页 #pricing 锚点不受影响。
  beforeLoad: () => assertPageEnabled('payment'),
  // 必须用 server function 而非 `useSession()`：后者 SSR 首帧 pending，
  // 按钮文案会在水合后跳变一次。
  // 价格也走 server function：展示价来自 Stripe，不写死在代码里。
  loader: async () => {
    const [session, catalog] = await Promise.all([fetchSession(), fetchPriceCatalog()])
    return { session, catalog }
  },
  // 不声明这个参数，`?checkout=cancelled` 会被当成未知 search 丢掉，
  // 用户取消结账回来就没有任何提示。
  validateSearch: (search: Record<string, unknown>): { checkout?: 'cancelled' } =>
    search.checkout === 'cancelled' ? { checkout: 'cancelled' } : {},
  head: () =>
    seo('/pricing', {
      title: m.pricing_page_title(),
      description: m.pricing_page_description(),
      locale: getLocale(),
    }),
  component: PricingPage,
})

/**
 * 周期切换的默认值：`pro_monthly` 第一个配好价格的周期。
 * 模块加载期求值即可：只依赖 env，不含随请求变化的 locale 文案。
 */
const defaultInterval: 'month' | 'year' | 'one_time' =
  availableIntervals(websiteConfig.payment.lookupKeyMap, 'pro_monthly')[0] ?? 'month'

/**
 * 定价页。
 *
 * CTA 行为由**是否配置了价格**决定，而非只看 `payment.enabled`：
 * 未配置时不能给一个点了就 502 的按钮，也不该暗示「立即购买」。
 * 月付 / 年付是 `pro_monthly` 下挂的两个价格，没配年付就不渲染「按年」选项。
 */
function PricingPage() {
  const router = useRouter()
  const { checkout } = Route.useSearch()
  const { session, catalog } = Route.useLoaderData()
  const authenticated = session !== null
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [interval, setInterval] = useState<'month' | 'year' | 'one_time'>(defaultInterval)

  // 展示价来自 Stripe：方案文案（`getPricingPlans`）+ 实时价格（`catalog`）。
  const plans = mergePricingPlans(getPricingPlans(), catalog)

  // 必须 `replace`：否则刷新会再弹一次早已过期的「结账未完成」。
  useCheckoutNotice({
    checkout,
    type: 'info',
    title: m.settings_billing_checkout_cancelled(),
    clearUrl: () => {
      void router.navigate({
        to: '/{-$locale}/pricing',
        params: { locale: getLocale() },
        replace: true,
      })
    },
  })

  async function onSelectPlan(planId: string) {
    // 周期取自配置而不是展示价：取价失败时 `plans[].prices` 是空的，
    // 从那里读周期会退化成默认的「月付」，买断方案就会去提交一个不存在的周期。
    const intervals = availableIntervals(websiteConfig.payment.lookupKeyMap, planId)
    const planInterval = intervals.includes('one_time') ? 'one_time' : interval
    const locale = getLocale()

    // 免费档要看会话：已登录用户再注册一次只会拿到「该邮箱已注册」。
    if (planId === 'free') {
      router.navigate({
        to: authenticated ? '/{-$locale}/dashboard' : '/{-$locale}/auth/register',
        params: { locale },
      })
      return
    }

    if (!isPlanPurchasable(planId, websiteConfig.payment.lookupKeyMap)) {
      router.navigate({
        to: '/{-$locale}/auth/register',
        params: { locale },
        search: { plan: planId },
      })
      return
    }

    setPendingPlanId(planId)
    try {
      const outcome = await startCheckout({ planId, interval: planInterval, locale })
      switch (outcome.kind) {
        case 'redirect':
          // 埋点在跳转前发：结账意图已成立，是否付成功由 purchase 事件记录。
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
            // 登录页的 `validateSearch` 只接受 `safeInternalPath` 的类型。
            search: { redirect: resolveRedirectTarget('/pricing') },
          })
          return
        case 'already-subscribed':
          // 服务端已挡下重复订阅（409）。用 toast 而非页面底部文案：
          // 提示必须出现在点击处附近，且这条要读两行，超时放宽到 8 秒。
          toast.add({
            type: 'info',
            title: m.payment_already_subscribed(),
            description: m.payment_already_subscribed_hint(),
            timeout: 8000,
          })
          return
        default:
          // 配置缺失或服务端错误：退回注册引导，比停在按钮加载态更好。
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
  const proIntervals = availableIntervals(websiteConfig.payment.lookupKeyMap, 'pro_monthly')
  const showIntervalSwitch =
    proIntervals.length > 1 && proIntervals.some((value) => value !== 'one_time')

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero title={m.pricing_hero_title()} subtitle={m.pricing_hero_subtitle()} />
      {showIntervalSwitch && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <ToggleGroup
            value={[interval]}
            onValueChange={(value) => {
              const next = value[0]
              // 取消选中时 Base UI 给空数组：保留当前值，否则点一下已选项就丢失选择。
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
          {interval === 'year' && <YearlySavingHint plans={plans} />}
        </div>
      )}
      <PricingBlock
        plans={plans}
        selectedInterval={interval}
        renderCta={(plan) => {
          const configured = isPlanPurchasable(plan.id, websiteConfig.payment.lookupKeyMap)
          const pending = pendingPlanId === plan.id
          // 按钮文字跟随点击后真正会发生的事，而不是固定的营销文案。
          const label = configured
            ? plan.cta.label
            : authenticated && plan.id === 'free'
              ? m.pricing_goto_dashboard()
              : m.pricing_free_cta()
          return (
            <Button className="w-full" disabled={pending} onClick={() => onSelectPlan(plan.id)}>
              {pending ? m.payment_checkout_redirecting() : label}
            </Button>
          )
        }}
      />
      <Cta
        title={m.pricing_cta_title()}
        primaryCta={{ label: m.pricing_cta_primary(), href: '/auth/register' }}
      />
      {/* 未配置价格时给一条明确线索：这个模板默认不带支付凭据。 */}
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
 * 两个数都是 Stripe 上的真实价格（不是写死的展示文案），所以这个折扣不会骗人。
 */
function YearlySavingHint({ plans }: { plans: ReturnType<typeof mergePricingPlans> }) {
  const pro = plans.find((plan) => plan.id === 'pro_monthly')
  const month = pro?.prices.find((price) => price.interval === 'month')
  const year = pro?.prices.find((price) => price.interval === 'year')
  if (!month?.amount || !year?.amount) return null
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

/** 任一 plan 配了价格时才隐藏「暂未开放购买」提示。 */
function hasAnyConfiguredPrice(): boolean {
  return getPricingPlans().some((plan) =>
    isPlanPurchasable(plan.id, websiteConfig.payment.lookupKeyMap),
  )
}
