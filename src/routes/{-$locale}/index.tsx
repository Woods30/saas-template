import { createFileRoute, redirect } from '@tanstack/react-router'
import { LandingPage } from '@/components/marketing/LandingPage'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
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
    // 展示价与结账收款读同一份价格目录（同一个缓存键），不会各说各话。
    // 取价失败只降级为「价格暂不可用」——价格是销售页的关键信息，
    // 但不该因为它拿不到就让整页 500。
    try {
      const catalog = await fetchPriceCatalog()
      return {
        priceCents: findCatalogAmount(
          catalog,
          websiteConfig.landingOffer.productId,
          websiteConfig.landingOffer.offerId,
        ),
      }
    } catch {
      return { priceCents: null }
    }
  },
  component: HomePage,
})

function HomePage() {
  const { priceCents } = Route.useLoaderData()
  return (
    <MarketingLayout>
      <LandingPage priceCents={priceCents} />
    </MarketingLayout>
  )
}
