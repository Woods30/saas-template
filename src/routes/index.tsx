import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="px-6 py-8">
      <h1 className="text-3xl font-bold">{m.site_title()}</h1>
      <p className="mt-2 text-muted-foreground">{m.site_description()}</p>
      <nav className="mt-6 flex gap-4 text-sm">
        <a href="/">{m.nav_home()}</a>
        <a href="/pricing">{m.nav_pricing()}</a>
        <a href="/docs">{m.nav_docs()}</a>
        <a href="/dashboard">{m.nav_dashboard()}</a>
      </nav>
      <Button className="mt-6">{m.nav_dashboard()}</Button>
    </main>
  )
}
