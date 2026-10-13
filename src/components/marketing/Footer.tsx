import { Link } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {websiteConfig.metadata.name}. {m.footer_rights()}
        </p>
        <nav className="flex gap-4">
          <Link
            to="/{-$locale}/marketing/legal/$slug"
            params={{ slug: 'terms' }}
            className="hover:text-foreground"
          >
            {m.footer_terms()}
          </Link>
          <Link
            to="/{-$locale}/marketing/legal/$slug"
            params={{ slug: 'privacy' }}
            className="hover:text-foreground"
          >
            {m.footer_privacy()}
          </Link>
          <Link to="/{-$locale}/marketing/changelog" className="hover:text-foreground">
            {m.footer_changelog()}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
