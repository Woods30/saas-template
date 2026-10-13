import { createFileRoute, redirect } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/')({
  beforeLoad: () => {
    const locale = getLocale()
    const first = allDocs.filter((d) => d.locale === locale).sort((a, b) => a.order - b.order)[0]
    if (!first) return
    throw redirect({
      to: '/{-$locale}/marketing/docs/$slug',
      params: { slug: first._meta.path },
    })
  },
  component: () => null,
})
