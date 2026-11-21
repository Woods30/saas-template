'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import { type DocEntry, type DocGroup, groupDocs } from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons';

/**
 * Documentation navigation.
 *
 * Documents are grouped by the `group` frontmatter key; a group heading can
 * be collapsed. Only the groups the visitor collapsed themselves stay
 * collapsed — a group that holds the current document is always open, so a
 * jump from the search results never hides the active entry.
 */
export function DocsSidebar({
  docs,
  activeSlug,
  onNavigate,
}: {
  docs: DocEntry[];
  /** The slug of the document being read; its group is expanded. */
  activeSlug?: string;
  /** Called after a link was followed (closes the mobile drawer). */
  onNavigate?: () => void;
}) {
  const groups = groupDocs(docs);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const activeGroup = useMemo(
    () =>
      groups.find((group) => group.items.some((doc) => doc.slug === activeSlug))
        ?.title,
    [groups, activeSlug]
  );

  useEffect(() => {
    if (activeGroup === undefined) return;
    setCollapsed((previous) => {
      if (!previous.has(activeGroup)) return previous;
      const next = new Set(previous);
      next.delete(activeGroup);
      return next;
    });
  }, [activeGroup]);

  function toggleGroup(title: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-sm">
        {m['docs.empty']()}
      </p>
    );
  }

  return (
    <nav className="text-sm" aria-label={m['docs.sidebar_title']()}>
      {groups.map((group) =>
        group.title === '' ? (
          <ul key="__root__" className="mb-4 space-y-0.5">
            {group.items.map((doc) => (
              <DocLink
                key={doc.slug}
                doc={doc}
                activeSlug={activeSlug}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          <DocGroupSection
            key={group.title}
            group={group}
            open={!collapsed.has(group.title)}
            onToggle={() => toggleGroup(group.title)}
            activeSlug={activeSlug}
            onNavigate={onNavigate}
          />
        )
      )}
    </nav>
  );
}

function DocGroupSection({
  group,
  open,
  onToggle,
  activeSlug,
  onNavigate,
}: {
  group: DocGroup;
  open: boolean;
  onToggle: () => void;
  activeSlug?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-1">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group text-foreground hover:text-primary mt-5 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors"
        >
          <span className="truncate">{group.title}</span>
          <ChevronRight
            className={`text-muted-foreground ml-auto size-4 shrink-0 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
            aria-hidden
          />
        </button>
      </h2>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {group.items.map((doc) => (
            <DocLink
              key={doc.slug}
              doc={doc}
              activeSlug={activeSlug}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocLink({
  doc,
  activeSlug,
  onNavigate,
}: {
  doc: DocEntry;
  activeSlug?: string;
  onNavigate?: () => void;
}) {
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON;
  // The active state is computed here: the index page and the article pages
  // are different routes, so the router cannot decide it.
  const isActive = activeSlug === doc.slug;

  const className = [
    'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground',
    isActive
      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
      : 'text-muted-foreground',
  ].join(' ');

  return (
    <li>
      <Link
        to="/docs/$slug"
        params={{ slug: doc.slug }}
        onClick={onNavigate}
        className={className}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{doc.title}</span>
      </Link>
    </li>
  );
}
