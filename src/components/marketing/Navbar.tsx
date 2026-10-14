import { IconArrowUpRight, IconMenu2, IconX } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { MenuItems } from '@/components/layout/MenuItems'
import { MenuLink } from '@/components/layout/MenuLink'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { getNavbarActions, getNavbarLinks } from '@/config/navbar-config'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

const navigationLinkClass =
  'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'

export function Navbar() {
  const locale = getLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  // 访客上下文：站点导航不读取会话状态，避免伪造登录信息。
  const links = getNavbarLinks(locale, { config: websiteConfig, authenticated: false })
  const actions = getNavbarActions(locale, websiteConfig)

  /** 关闭移动面板与已展开的 details；供导航与 Escape 复用。 */
  const closeMenus = useCallback(() => {
    setMenuOpen(false)
    for (const details of headerRef.current?.querySelectorAll('details[open]') ?? []) {
      details.removeAttribute('open')
    }
  }, [])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Escape 统一关闭已展开的 details；若移动面板处于打开状态，一并收起并归还焦点。
      closeMenus()
      if (menuOpen) menuTrigger.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, closeMenus])

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link
          to="/{-$locale}"
          params={{ locale }}
          onClick={closeMenus}
          aria-label={websiteConfig.metadata.name}
          className="flex shrink-0 items-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:bg-white"
        >
          <img
            src={websiteConfig.metadata.images.logoLight}
            alt=""
            width={1400}
            height={380}
            className="h-auto w-32 sm:w-40"
          />
        </Link>
        <div className="hidden items-center lg:flex">
          <MenuItems
            items={links}
            variant="navbar"
            linkClassName={navigationLinkClass}
            onNavigate={closeMenus}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <LocaleSwitcher value={locale} />
          <MenuLink
            item={actions.login}
            className={`${navigationLinkClass} hidden lg:block`}
            onClick={closeMenus}
          />
          <MenuLink
            item={actions.primary}
            className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:inline-flex"
            onClick={closeMenus}
          >
            {actions.primary.title}
            <IconArrowUpRight size={16} aria-hidden />
          </MenuLink>
          <button
            ref={menuTrigger}
            type="button"
            aria-label={menuOpen ? m.nav_menu_close() : m.nav_menu_open()}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:hidden"
          >
            {menuOpen ? <IconX size={20} aria-hidden /> : <IconMenu2 size={20} aria-hidden />}
          </button>
        </div>
      </nav>
      <div
        id={menuId}
        hidden={!menuOpen}
        className="absolute inset-x-0 top-16 border-b border-border bg-background px-5 py-4 shadow-lg lg:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1">
          <MenuItems
            items={links}
            variant="navbar"
            linkClassName={navigationLinkClass}
            onNavigate={closeMenus}
          />
          <MenuLink item={actions.login} className={navigationLinkClass} onClick={closeMenus} />
          <MenuLink
            item={actions.primary}
            className="mt-2 inline-flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            onClick={closeMenus}
          >
            {actions.primary.title}
            <IconArrowUpRight size={18} aria-hidden />
          </MenuLink>
        </div>
      </div>
    </header>
  )
}
