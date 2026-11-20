'use client';

import { useState, type ReactNode } from 'react';
import { Menu, Search, X } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import type { DocEntry } from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';
import { DocsSearch } from '@/components/docs/DocsSearch';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';

/** Shared look of the icon buttons (the size is set by the caller). */
const ICON_BUTTON_CLASS =
  'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring';

/**
 * Documentation shell: navigation on the left, the document on the right.
 *
 * On wide screens the navigation is a permanent column; on narrow screens it
 * becomes a drawer opened from the toolbar above the document.
 */
export function DocsLayout({
  docs,
  activeSlug,
  children,
}: {
  docs: DocEntry[];
  /** The slug of the document being read. */
  activeSlug?: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex w-full flex-1">
      {/* Wide screens: the navigation is always visible. */}
      <aside className="border-border sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 border-r lg:block">
        <SidebarPanel
          docs={docs}
          activeSlug={activeSlug}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
        />
      </aside>

      <div className="min-w-0 flex-1">
        {/* Narrow screens: the navigation lives in a drawer. */}
        <div className="border-border bg-background/90 sticky top-16 z-30 flex h-12 items-center gap-2 border-b px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            aria-label={m['docs.sidebar_open']()}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className={`${ICON_BUTTON_CLASS} size-9`}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="text-muted-foreground truncate text-sm">
            {m['docs.title']()}
          </span>
          <button
            type="button"
            aria-label={m['docs.search_label']()}
            onClick={() => setSearchOpen(true)}
            className={`${ICON_BUTTON_CLASS} ml-auto size-9`}
          >
            <Search className="size-5" aria-hidden />
          </button>
        </div>

        <main className="px-6 py-10 sm:px-10">{children}</main>
      </div>

      {/* The drawer reuses the navigation panel; the overlay traps the focus
          and locks the scroll, so the panel does not have to. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-60 gap-0 p-0"
          showCloseButton={false}
        >
          {/* The overlay needs an accessible name; the panel carries the
              visible one. */}
          <SheetTitle className="sr-only">
            {m['docs.sidebar_title']()}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {m['docs.sidebar_title']()}
          </SheetDescription>
          <SidebarPanel
            docs={docs}
            activeSlug={activeSlug}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
            onClose={() => setDrawerOpen(false)}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * The navigation panel: brand, search, document list and the theme toggle.
 * The permanent column and the drawer share it — they only differ in how
 * they are closed.
 */
function SidebarPanel({
  docs,
  activeSlug,
  searchOpen,
  onSearchOpenChange,
  onClose,
  onNavigate,
}: {
  docs: DocEntry[];
  activeSlug?: string;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onClose?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="bg-sidebar flex h-full w-full flex-col">
      <div className="border-border flex items-center gap-2 border-b p-3">
        <Link
          href="/"
          className="min-w-0 truncate font-serif text-lg italic"
          aria-label={envConfigs.app_name}
        >
          {envConfigs.app_name}
        </Link>
        <span className="text-muted-foreground hidden truncate text-sm lg:inline">
          {m['docs.title']()}
        </span>
        {/* In the drawer the toolbar button is covered by the overlay, so the
            panel needs its own way out. */}
        {onClose && (
          <button
            type="button"
            aria-label={m['docs.sidebar_close']()}
            onClick={onClose}
            className={`${ICON_BUTTON_CLASS} ml-auto size-8`}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* The search does not scroll with the document list. */}
      <div className="border-border border-b p-3">
        <DocsSearch
          docs={docs}
          open={searchOpen}
          onOpenChange={onSearchOpenChange}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <DocsSidebar
          docs={docs}
          activeSlug={activeSlug}
          onNavigate={onNavigate}
        />
      </div>

      <div className="border-border flex items-center justify-end gap-1 border-t p-3">
        <ThemeToggle />
      </div>
    </div>
  );
}
