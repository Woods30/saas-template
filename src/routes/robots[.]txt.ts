import { createFileRoute } from '@tanstack/react-router'
import { getBaseUrl } from '@/lib/urls'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const base = getBaseUrl().replace(/\/$/, '')
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /admin/
Sitemap: ${base}/sitemap.xml
`
        return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
      },
    },
  },
})
