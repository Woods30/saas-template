import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchSession } from '@/auth/session'
import { Cta, Hero } from '@/components/sections'
import { Pricing as PricingBlock } from '@/components/sections/Pricing'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { getProducts, isProductPurchasable, productIntervals } from '@/config/products'
import { useCheckoutNotice } from '@/hooks/use-checkout-notice'
import { trackBeginCheckout } from '@/lib/analytics/events'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { resolveRedirectTarget } from '@/lib/urls'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { startCheckout } from '@/payment/checkout-client'
import { mergePricingProducts } from '@/payment/price-catalog'
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
 * 定价页。
 *
 * 页面结构由**产品配置**决定：每个产品一张卡，卡内可切换它自己的付费方式
 * （订阅产品有月付 / 年付，买断产品只有一次性）。「一个全局周期切换器」表达不了
 * 「切到一次性」对买断产品意味着什么，所以切换器在卡内。
 *
 * CTA 行为由**是否配置了价格**决定，而非只看 `payment.enabled`：
 * 未配置时不能给一个点了就 502 的按钮，也不该暗示「立即购买」。
 */
function PricingPage() {
  const router = useRouter()
  const { checkout } = Route.useSearch()
  const { session, catalog } = Route.useLoaderData()
  const authenticated = session !== null
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)

  // 展示价来自 Stripe：产品文案（`getProducts`）+ 实时价格（`catalog`）。
  const products = mergePricingProducts(getProducts(), catalog)

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

  async function onSelectProduct(productId: string, interval?: 'month' | 'year' | 'one_time') {
    const locale = getLocale()

    // 免费档要看会话：已登录用户再注册一次只会拿到「该邮箱已注册」。
    if (productId === 'free') {
      router.navigate({
        to: authenticated ? '/{-$locale}/dashboard' : '/{-$locale}/auth/register',
        params: { locale },
      })
      return
    }

    if (!isProductPurchasable(productId)) {
      router.navigate({
        to: '/{-$locale}/auth/register',
        params: { locale },
        search: { plan: productId },
      })
      return
    }

    // 周期取自配置而不是展示价：取价失败时 `product.options` 是空的，
    // 从那里读周期会退化成默认的「月付」，买断产品就会去提交一个不存在的周期。
    const intervals = productIntervals(productId)
    const productInterval = intervals.includes('one_time')
      ? 'one_time'
      : interval && intervals.includes(interval)
        ? interval
        : intervals[0]
    if (!productInterval) return

    setPendingProductId(productId)
    try {
      const outcome = await startCheckout({ productId, interval: productInterval, locale })
      switch (outcome.kind) {
        case 'redirect':
          // 埋点在跳转前发：结账意图已成立，是否付成功由 purchase 事件记录。
          trackBeginCheckout({
            productId,
            mode: productInterval === 'one_time' ? 'payment' : 'subscription',
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
        case 'already-higher-tier':
          // 已经持有更高等级：再买低级的只会重复扣钱。
          toast.add({
            type: 'info',
            title: m.payment_already_higher_tier(),
            description: m.payment_already_higher_tier_hint(),
            timeout: 8000,
          })
          return
        case 'exclusive-product':
          // 与已购方案显式互斥：两者不能同时持有。
          toast.add({
            type: 'info',
            title: m.payment_exclusive_product(),
            description: m.payment_exclusive_product_hint(),
            timeout: 8000,
          })
          return
        default:
          // 配置缺失或服务端错误：退回注册引导，比停在按钮加载态更好。
          router.navigate({
            to: '/{-$locale}/auth/register',
            params: { locale },
            search: { plan: productId },
          })
      }
    } finally {
      setPendingProductId(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero title={m.pricing_hero_title()} subtitle={m.pricing_hero_subtitle()} />
      <PricingBlock
        products={products}
        renderCta={(product, option) => {
          const configured = isProductPurchasable(product.id)
          const pending = pendingProductId === product.id
          // 按钮文字跟随点击后真正会发生的事，而不是固定的营销文案。
          const label = configured
            ? product.cta.label
            : authenticated && product.id === 'free'
              ? m.pricing_goto_dashboard()
              : m.pricing_free_cta()
          return (
            <Button
              className="w-full"
              disabled={pending}
              onClick={() => onSelectProduct(product.id, option?.interval)}
            >
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

/** 任一产品配了价格时才隐藏「暂未开放购买」提示。 */
function hasAnyConfiguredPrice(): boolean {
  return getProducts().some((product) => isProductPurchasable(product.id))
}
