import { Link } from '@tanstack/react-router'
import { MenuItems } from '@/components/layout/MenuItems'
import { MenuLink } from '@/components/layout/MenuLink'
import { getFooterLinks } from '@/config/footer-config'
import { getSocialLinks } from '@/config/social-config'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

const footerLinkClass =
  'w-fit rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'

const socialLinkClass =
  'inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'

export function Footer() {
  const locale = getLocale()
  const links = getFooterLinks(locale, { config: websiteConfig, authenticated: false })
  const social = getSocialLinks(websiteConfig, locale)

  return (
    <footer className="border-t border-border/70 px-5 pb-8 pt-14 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              to="/{-$locale}"
              params={{ locale }}
              className="inline-flex items-center gap-2 rounded-sm text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <img src={websiteConfig.metadata.images.icon} width={32} height={32} alt="" />
              {websiteConfig.metadata.name}
            </Link>
            <p className="mt-4 text-sm font-semibold" lang="en">
              {m.brand_slogan()}
            </p>
            <p className="mt-2 max-w-xs text-sm leading-7 text-muted-foreground">
              {m.footer_description()}
            </p>
            {social.length > 0 && (
              <nav
                aria-label={m.social_links_label()}
                className="mt-5 flex flex-wrap items-center gap-3"
              >
                {social.map((item) => {
                  const Icon = item.icon
                  return (
                    <MenuLink key={item.id} item={item} className={socialLinkClass}>
                      {Icon && <Icon size={18} aria-hidden />}
                      <span className="sr-only">{item.title}</span>
                    </MenuLink>
                  )
                })}
              </nav>
            )}
            <p className="mt-5 font-mono text-xs text-muted-foreground">
              TanStack Start × Cloudflare
            </p>
          </div>
          <MenuItems items={links} variant="footer" linkClassName={footerLinkClass} />
        </div>
        <div className="border-t border-border/70 pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {websiteConfig.metadata.name}. {m.footer_rights()}
        </div>
      </div>
    </footer>
  )
}
