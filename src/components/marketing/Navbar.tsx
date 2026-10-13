import { Link } from '@tanstack/react-router'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export function Navbar() {
  const locale = getLocale()
  return (
    <nav className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link to="/{-$locale}" className="text-lg font-bold hover:opacity-80">
        {websiteConfig.metadata.name}
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link
          to="/{-$locale}/marketing/features"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
          preload="intent"
        >
          {m.nav_features()}
        </Link>
        <Link
          to="/{-$locale}/pricing"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
          preload="intent"
        >
          {m.nav_pricing()}
        </Link>
        <Link
          to="/{-$locale}/marketing/blog"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
          preload="intent"
        >
          {m.nav_blog()}
        </Link>
        <Link
          to="/{-$locale}/docs"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
          preload="intent"
        >
          {m.nav_docs()}
        </Link>
        <Link
          to="/{-$locale}/marketing/changelog"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
          preload="intent"
        >
          {m.nav_changelog()}
        </Link>
        <Link
          to="/{-$locale}/contact"
          className="text-muted-foreground hover:text-foreground"
          activeProps={{ className: 'font-semibold text-foreground' }}
        >
          {m.nav_contact()}
        </Link>
        <ThemeToggle />
        <LocaleSwitcher value={locale} />
        <Link
          to="/{-$locale}/auth/login"
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          {m.nav_login()}
        </Link>
      </div>
    </nav>
  )
}
