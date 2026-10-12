import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/')({
  // 标题与 description 在 `head()` 内按请求调用 `m.*()`，随语言变化（`head()` 是
  // 每请求调用的函数，不像模块顶层那样会被冻结为单一语言）；
  // canonical 与 OG 由 `seo()` 依据解析后的 VITE_BASE_URL 生成。
  head: () =>
    seo('/', {
      title: m.site_name(),
      description: m.site_description(),
      type: 'website',
    }),
  component: HomePage,
})

function HomePage() {
  return (
    <main className="px-6 py-8">
      <h1 className="text-3xl font-bold">{m.site_title()}</h1>
      <p className="mt-2 text-muted-foreground">{m.site_description()}</p>
      <nav className="mt-6 flex gap-4 text-sm">
        <a href="/">{m.nav_home()}</a>
      </nav>
      <Button className="mt-6">{m.nav_dashboard()}</Button>
    </main>
  )
}
