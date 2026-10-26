import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Hero, NewsletterCta } from '@/components/sections'
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
      <Hero title={m.waitlist_hero_title()} subtitle={m.waitlist_hero_subtitle()} align="center" />
      {available ? (
        <NewsletterCta
          title={m.waitlist_hero_title()}
          description={m.waitlist_hero_subtitle()}
          successMessage={m.newsletter_success()}
        />
      ) : (
        <p className="mx-auto max-w-xl px-6 pb-16 text-center text-sm text-muted-foreground">
          {m.waitlist_unavailable()}
        </p>
      )}
      <Faq
        title={m.waitlist_hero_title()}
        items={[
          { question: m.waitlist_faq_q1(), answer: m.waitlist_faq_a1() },
          { question: m.waitlist_faq_q2(), answer: m.waitlist_faq_a2() },
        ]}
      />
      <Cta
        title={m.waitlist_cta_title()}
        variant="quiet"
        primaryCta={{ label: m.waitlist_cta_primary(), href: '/marketing/contact' }}
      />
    </>
  )
}
