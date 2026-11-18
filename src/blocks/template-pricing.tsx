import { IconCheck } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { settingsRoutes } from '@/config/routes'
import { websiteConfig } from '@/config/website'
import { useSession } from '@/core/auth/client'
import { startCheckout } from '@/core/payment/checkout-client'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import {
  collectionOrderErrorMessage,
  createCollectionOrder,
} from '@/modules/manual-payments/service'

/** 核销链路的标价视图：金额（分）与币种。 */
export interface CollectionPriceView {
  amount: number
  currency: string
}

/**
 * 首页模板买断区块。
 *
 * `price` 为展示用金额字符串；`null` 表示价格目录取不到，降级为「价格暂不可用」。
 *
 * 金额由 Stripe 的价格目录给出（见 `fetchPriceCatalog`），代码里不存第二份。
 * 核销收款链路下价格来自本地标价（`collectionPrices`，单位分）——那条链路
 * 不接支付渠道，没有价格目录可用。
 */
export function TemplatePricing({ price }: { price: string | null }) {
  const id = useId()
  const { data: session, isPending } = useSession()
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const locale = getLocale()
  const navigate = useNavigate()
  const loginUrl = `/${locale}/auth/login?redirect=${encodeURIComponent(`/${locale}/#pricing`)}`
  const collectionMode = websiteConfig.payment.checkoutMode === 'collection'
  // 两条链路互斥：核销收款走核销模块，渠道支付走支付模块。
  const enabled =
    websiteConfig.auth.enabled &&
    (collectionMode ? websiteConfig.collection.enabled : websiteConfig.payment.enabled)

  async function buy() {
    if (pending) return
    setPending(true)
    setNotice('')
    // 核销链路：创建核销订单并站内导航到订单详情，不调渠道结账。
    if (collectionMode) {
      const result = await createCollectionOrder({
        productId: websiteConfig.landingOffer.productId,
        offerId: websiteConfig.landingOffer.offerId,
      })
      if (result.kind === 'redirect') {
        await navigate({
          to: settingsRoutes.orderDetail,
          params: { locale, orderId: result.orderId },
        })
        return
      }
      if (result.kind === 'unauthenticated') {
        window.location.assign(loginUrl)
        return
      }
      setPending(false)
      setNotice(
        result.kind === 'not-configured'
          ? m.payment_checkout_not_configured()
          : collectionOrderErrorMessage(result.code),
      )
      return
    }
    const result = await startCheckout({
      productId: websiteConfig.landingOffer.productId,
      offerId: websiteConfig.landingOffer.offerId,
      locale,
      // 首页的购买入口在 `#pricing` 锚点，取消后回到这里。
      cancelPath: `/${locale}/#pricing`,
    })
    if (result.kind === 'redirect') {
      window.location.assign(result.url)
      return
    }
    if (result.kind === 'unauthenticated') {
      window.location.assign(loginUrl)
      return
    }
    setPending(false)
    setNotice(
      result.kind === 'not-configured'
        ? m.payment_checkout_not_configured()
        : result.kind === 'error' && result.message === 'checkout_pending'
          ? m.payment_checkout_pending()
          : m.payment_checkout_error(),
    )
  }
  const benefits = [
    m.home_pricing_source(),
    m.home_pricing_support(),
    m.home_pricing_updates(),
    m.home_pricing_modules(),
  ]
  return (
    <section
      id="pricing"
      aria-labelledby={id}
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 md:py-24"
    >
      <div className="grid gap-10 rounded-xl border border-border bg-card p-7 md:grid-cols-2 md:p-12">
        <div>
          <h2 id={id} className="text-3xl font-semibold tracking-tight md:text-4xl">
            {m.home_pricing_title()}
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
            {m.home_pricing_description()}
          </p>
          <ul className="mt-7 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm">
                <IconCheck size={18} className="text-success" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start justify-center md:pl-10">
          <p className="text-5xl font-semibold tracking-tight">{price ?? '—'}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {price ? m.home_pricing_once() : m.home_pricing_price_unavailable()}
          </p>
          {enabled && !isPending && !session ? (
            <a
              href={loginUrl}
              className={buttonVariants({ className: 'mt-7 h-auto min-h-11 px-5 py-3' })}
            >
              {m.home_pricing_buy()}
            </a>
          ) : (
            <Button
              disabled={!enabled || isPending || pending}
              onClick={() => void buy()}
              aria-busy={pending}
              className="mt-7 h-auto min-h-11 px-5 py-3"
            >
              {pending ? m.payment_checkout_opening() : m.home_pricing_buy()}
            </Button>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm text-destructive">
              {notice}
            </p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            {m.home_source_resources_description()}
          </p>
        </div>
      </div>
    </section>
  )
}
