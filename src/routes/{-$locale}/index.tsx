import { createFileRoute, redirect } from '@tanstack/react-router'
import { LandingPage } from '@/blocks/landing-page'
import { MarketingLayout } from '@/blocks/marketing-layout'
import { resolveCollectionPrice } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { findCatalogAmount } from '@/core/payment/price-catalog'
import { fetchPriceCatalog } from '@/core/payment/pricing'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

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
    // 结账链路决定价格事实源：核销收款读本地标价，渠道支付读价格目录。
    if (websiteConfig.payment.checkoutMode === 'collection') {
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
