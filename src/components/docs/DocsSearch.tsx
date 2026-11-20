'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CornerDownRight, Search } from 'lucide-react';

import {
  type DocEntry,
  type DocSearchResult,
  searchDocs,
} from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/**
 * Documentation search.
 *
 * The trigger lives in the sidebar, the results in a dialog — a 240px
 * sidebar has no room for a result list. The search itself is client side:
 * results appear once a query is typed.
 */
export function DocsSearch({
  docs,
  open,
  onOpenChange,
}: {
  docs: DocEntry[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const openState = isControlled ? open : internalOpen;
  const [query, setQuery] = useState('');

  const results = searchDocs(docs, query);
  const hasQuery = query.trim() !== '';

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
      // Closing resets the query so the next open starts empty.
      if (!next) setQuery('');
    },
    [isControlled, onOpenChange]
  );

  // ⌘K / Ctrl+K — the trigger advertises it, so it has to work.
  useEffect(() => {
    if (openState) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey))
        return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openState, setOpen]);

  return (
    <>
      <button
        type="button"
        aria-label={m['docs.search_label']()}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground border-border hover:border-foreground/30 flex w-full items-center gap-2 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm transition-colors"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{m['docs.search_placeholder']()}</span>
        <kbd className="text-muted-foreground bg-muted ml-auto shrink-0 rounded border px-1 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <Dialog open={openState} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">
            {m['docs.search_label']()}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {m['docs.search_placeholder']()}
          </DialogDescription>

          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
            <Input
              autoFocus
              aria-label={m['docs.search_placeholder']()}
              placeholder={m['docs.search_placeholder']()}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 border-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!hasQuery ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                {m['docs.search_hint']()}
              </p>
            ) : results.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                {m['docs.search_empty']()}
              </p>
            ) : (
              <ul className="space-y-1">
                {results.map((result) => (
                  <li key={result.doc.slug}>
                    <SearchResult
                      result={result}
                      onSelect={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchResult({
  result,
  onSelect,
}: {
  result: DocSearchResult;
  onSelect: () => void;
}) {
  const { doc, sections, keyword } = result;
  const Icon = DOC_ICON[doc.slug] ?? DOC_FALLBACK_ICON;

  return (
    <div className="rounded-md">
      <Link
        to="/docs/$slug"
        params={{ slug: doc.slug }}
        onClick={onSelect}
        className="group hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
      >
        <span className="text-muted-foreground group-hover:text-foreground border-border bg-muted/50 flex size-8 shrink-0 items-center justify-center rounded-md border">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            <Highlight text={doc.title} keyword={keyword} />
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            <Highlight text={doc.description} keyword={keyword} />
          </span>
        </span>
      </Link>
      {sections.length > 0 && (
        <ul className="border-border mt-0.5 mb-1 ml-[3.25rem] space-y-0.5 border-l pl-2">
          {sections.map((section) => (
            // The section without a heading (the intro) has no id and appears
            // at most once, so a fixed key is enough.
            <li key={section.id === '' ? 'intro' : section.id}>
              {section.text === '' ? (
                <p className="text-muted-foreground py-1 text-xs">
                  <Highlight text={section.snippet} keyword={keyword} />
                </p>
              ) : (
                <SectionLink
                  slug={doc.slug}
                  section={section}
                  keyword={keyword}
                  onSelect={onSelect}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionLink({
  slug,
  section,
  keyword,
  onSelect,
}: {
  slug: string;
  section: { id: string; text: string; level: 2 | 3; snippet: string };
  keyword: string;
  onSelect: () => void;
}) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug }}
      hash={section.id}
      onClick={onSelect}
      className={`hover:bg-muted hover:text-foreground text-muted-foreground block rounded px-2 py-1 text-xs transition-colors ${
        section.level === 3 ? 'pl-5' : ''
      }`}
    >
      <span className="flex items-center gap-1.5">
        {section.level === 3 && (
          <CornerDownRight className="size-3 shrink-0 opacity-60" aria-hidden />
        )}
        <span className="truncate font-medium">
          <Highlight text={section.text} keyword={keyword} />
        </span>
      </span>
      {section.snippet !== '' && (
        <span className="mt-0.5 block truncate opacity-80">
          <Highlight text={section.snippet} keyword={keyword} />
        </span>
      )}
    </Link>
  );
}

/**
 * Wrap the matched part of a text in `<mark>`. The match is
 * case-insensitive, the original casing is kept.
 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (keyword === '') return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const parts: ReactNode[] = [];

  let cursor = 0;
  let at = lowerText.indexOf(lowerKeyword);
  while (at !== -1) {
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="bg-primary/20 rounded-sm px-0.5 text-inherit">
        {text.slice(at, at + keyword.length)}
      </mark>
    );
    cursor = at + keyword.length;
    at = lowerText.indexOf(lowerKeyword, cursor);
  }

  if (parts.length === 0) return <>{text}</>;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
