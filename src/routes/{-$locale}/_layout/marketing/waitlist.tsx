import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Hero, NewsletterCta } from '@/components/sections'
import { waitlistBlocks } from '@/config/pages'
import { websiteConfig } from '@/config/website'
import { getRequestLocale } from '@/lib/locale'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/waitlist')({
  head: () =>
    seo('/marketing/waitlist', {
      title: m.waitlist_page_title(),
      description: m.waitlist_page_description(),
      locale: getRequestLocale(),
      pageType: 'WebPage',
    }),
  component: WaitlistPage,
})

function WaitlistPage() {
  // 模块关闭时 `/api/newsletter` 返回 404，页面仍可达但不能给必然失败的按钮。
  const available = websiteConfig.newsletter.enabled
  return (
    <>
      <Hero {...waitlistBlocks.Hero} />
      {available ? (
        <NewsletterCta {...waitlistBlocks.Newsletter} />
      ) : (
        <p className="mx-auto max-w-xl px-6 pb-16 text-center text-sm text-muted-foreground">
          {m.waitlist_unavailable()}
        </p>
      )}
      <Faq {...waitlistBlocks.Faq} />
      <Cta {...waitlistBlocks.Cta} />
    </>
  )
}
