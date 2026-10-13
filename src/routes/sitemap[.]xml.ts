import { createFileRoute } from '@tanstack/react-router'
import { allBlogs, allChangelogs, allDocs } from 'content-collections'
import { LOCALES } from '@/lib/locale'
import { getBaseUrl } from '@/lib/urls'

const STATIC_PATHS = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/blog',
  '/docs',
  '/changelog',
  '/legal/terms',
  '/legal/privacy',
] as const

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const base = getBaseUrl().replace(/\/$/, '')
        const urls: Array<{ loc: string; alternates: string }> = []
        for (const path of STATIC_PATHS) {
          for (const l of LOCALES) {
            const loc = `${base}/${l}${path === '/' ? '' : path}`
            const alternates = LOCALES.map(
              (al) =>
                `<xhtml:link rel="alternate" hreflang="${al}" href="${base}/${al}${path === '/' ? '' : path}"/>`,
            ).join('')
            urls.push({ loc, alternates })
          }
        }
        // Dynamic content
        for (const l of LOCALES) {
          for (const p of allBlogs.filter((b) => b.locale === l)) {
            urls.push({ loc: `${base}/${l}/blog/${p._meta.path}`, alternates: '' })
          }
          for (const d of allDocs.filter((d) => d.locale === l)) {
            urls.push({ loc: `${base}/${l}/docs/${d._meta.path}`, alternates: '' })
          }
          for (const c of allChangelogs.filter((c) => c.locale === l)) {
            urls.push({ loc: `${base}/${l}/changelog#${c._meta.path}`, alternates: '' })
          }
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map((u) => `<url><loc>${u.loc}</loc>${u.alternates}<changefreq>weekly</changefreq></url>`)
  .join('\n')}
</urlset>`
        return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
      },
    },
  },
})
