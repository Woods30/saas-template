import { createFileRoute } from '@tanstack/react-router'
import { allChangelogs } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { assertPageEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/changelog/')({
  beforeLoad: () => assertPageEnabled('changelog'),
  head: () =>
    seo('/marketing/changelog', {
      title: m.changelog_page_title(),
      description: m.changelog_page_description(),
      locale: getLocale(),
    }),
  component: ChangelogPage,
})

function ChangelogPage() {
  const locale = getLocale()
  const entries = allChangelogs
    .filter((c) => c.locale === locale)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{m.changelog_page_title()}</h1>
      <div className="mt-8 space-y-10">
        {entries.map((c) => (
          <article key={c._meta.path}>
            <p className="text-sm text-muted-foreground">{new Date(c.date).toLocaleDateString()}</p>
            <h2 className="mt-1 text-2xl font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm">{c.summary}</p>
            <Mdx source={c.content} />
          </article>
        ))}
      </div>
    </main>
  )
}
