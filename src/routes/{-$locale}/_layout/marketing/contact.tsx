import { createFileRoute } from '@tanstack/react-router'
import { ContactForm } from '@/components/contact/ContactForm'
import { Cta, Hero } from '@/components/sections'
import { getRequestLocale } from '@/lib/locale'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/contact')({
  beforeLoad: () => assertPageEnabled('contact'),
  head: () =>
    seo('/marketing/contact', {
      title: m.contact_page_title(),
      description: m.contact_page_description(),
      locale: getRequestLocale(),
      pageType: 'ContactPage',
    }),
  component: ContactPage,
})

function ContactPage() {
  return (
    <>
      <Hero title={m.contact_hero_title()} subtitle={m.contact_hero_subtitle()} align="center" />
      <ContactForm />
      <Cta
        title={m.contact_cta_title()}
        variant="quiet"
        primaryCta={{ label: m.contact_cta_primary(), href: '/docs' }}
      />
    </>
  )
}
