import { createFileRoute, redirect } from '@tanstack/react-router'
import { docsLanding } from '@/lib/docs'
import { getRequestLocale } from '@/lib/locale'

/**
 * `/docs` 本身不渲染内容，重定向到该语言下的第一篇文档。
 * slug 与语言无关（见 `src/lib/docs.ts`），因此切换语言时 URL 保持稳定。
 */
export const Route = createFileRoute('/{-$locale}/_layout/docs/')({
  beforeLoad: () => {
    const locale = getRequestLocale()
    const landing = docsLanding(locale)
    if (!landing) return
    throw redirect({
      to: '/{-$locale}/docs/$slug',
      params: { locale, slug: landing.slug },
    })
  },
  component: () => null,
})
