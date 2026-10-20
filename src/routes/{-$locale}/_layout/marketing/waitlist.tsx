import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Hero, NewsletterCta } from '@/components/blocks/marketing'
import { waitlistBlocks } from '@/config/blocks'
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
  // newsletter 模块默认关闭，此时 `/api/newsletter` 返回 404。页面仍然可达（它本身
  // 是静态营销页），但不能给一个点下去必然失败的按钮——换成说明 + 联系入口。
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
