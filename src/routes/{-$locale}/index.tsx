import { createFileRoute, redirect } from '@tanstack/react-router'
import { resolveCollectionPrice } from '@/collection/pricing'
import { LandingPage } from '@/components/marketing/LandingPage'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { findCatalogAmount } from '@/payment/price-catalog'
import { fetchPriceCatalog } from '@/payment/pricing'

/**
 * 首页展示价按结账模式分流：
 *
 * - `provider` 模式：金额来自所选渠道的价格目录（同一个缓存键，展示与结账不会
 *   各说各话）；
 * - `collection` 模式：核销链路不接渠道，金额的事实源是 `collectionPrices`（分），
 *   经 `formatMoneyAmount()` 按币种格式化，不再硬编码美元。
 *
 * 取价失败只降级为「价格暂不可用」——价格是销售页的关键信息，但不该因为它
 * 拿不到就让整页 500。
 */
export const Route = createFileRoute('/{-$locale}/')({
  beforeLoad: () => {
    // 文档站部署在独立域时，根路径直接进文档首页。
    if (!websiteConfig.docs.asHome) return
    const locale = getRequestLocale()
    throw redirect({ to: '/{-$locale}/docs', params: { locale } })
  },
  head: () =>
    seo('/', {
      title: m.home_page_title(),
      description: m.home_page_description(),
      locale: getLocale(),
      pageType: 'WebPage',
    }),
  loader: async () => {
    const offer = {
      productId: websiteConfig.landingOffer.productId,
      offerId: websiteConfig.landingOffer.offerId,
    }
    if (websiteConfig.checkout.mode === 'collection') {
      const price = resolveCollectionPrice(offer.productId, offer.offerId)
      return {
        priceCents: null,
        collectionPrice: price ? { amount: price.amount, currency: price.currency } : null,
      }
    }
    try {
      const catalog = await fetchPriceCatalog()
      return {
        priceCents: findCatalogAmount(catalog, offer.productId, offer.offerId),
        collectionPrice: null,
      }
    } catch {
      return { priceCents: null, collectionPrice: null }
    }
  },
  component: HomePage,
})

function HomePage() {
  const { priceCents, collectionPrice } = Route.useLoaderData()
  return (
    <MarketingLayout>
      <LandingPage priceCents={priceCents} collectionPrice={collectionPrice} />
    </MarketingLayout>
  )
}
