import { createFileRoute } from '@tanstack/react-router'
import { BlogList } from '@/blocks/blog-list'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/')({
  beforeLoad: () => assertPageEnabled('blog'),
  head: () =>
    seo('/marketing/blog', {
      title: m.blog_page_title(),
      description: m.blog_page_description(),
      locale: getLocale(),
      pageType: 'CollectionPage',
    }),
  component: BlogIndex,
})

function BlogIndex() {
  return <BlogList locale={getLocale()} />
}
