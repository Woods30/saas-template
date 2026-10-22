import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/components/marketing/LandingPage'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { fetchPriceCatalog } from '@/payment/pricing'

export const Route = createFileRoute('/{-$locale}/')({
  // 首页定价概览展示的是 Stripe 上的真实价格，与定价页同源。
  // 取价失败时退化成「暂无价格」，首页照常渲染——营销页不该因为支付服务
  // 不可用而整个挂掉。
  loader: async () => {
    try {
      return await fetchPriceCatalog()
    } catch {
      return {}
    }
  },
  head: () =>
    seo('/', {
      title: m.home_page_title(),
      description: m.site_description(),
      locale: getLocale(),
      pageType: 'WebPage',
    }),
  component: HomePage,
})

function HomePage() {
  const catalog = Route.useLoaderData()
  return (
    <MarketingLayout>
      <LandingPage catalog={catalog} />
    </MarketingLayout>
  )
}
