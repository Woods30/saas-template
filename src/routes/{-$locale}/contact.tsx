import { createFileRoute } from '@tanstack/react-router'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/contact')({
  beforeLoad: () => assertPageEnabled('contact'),
  head: () =>
    seo('/contact', {
      title: m.contact_page_title(),
      description: m.contact_page_description(),
      locale: getLocale(),
    }),
  component: () => <div>contact</div>,
})
