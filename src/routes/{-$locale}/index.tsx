import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/components/marketing/LandingPage'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/')({
  head: () =>
    seo('/', { title: m.site_name(), description: m.site_description(), locale: getLocale() }),
  component: () => (
    <MarketingLayout>
      <LandingPage />
    </MarketingLayout>
  ),
})
