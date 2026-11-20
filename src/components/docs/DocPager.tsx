import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import type { DocNeighbor } from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';

/**
 * The previous / next document at the bottom of a page.
 *
 * The order follows the `order` of the documents and does not stop at a
 * group border. The grid has two fixed columns so a missing neighbour
 * leaves a placeholder instead of moving the card.
 */
export function DocPager({
  prev,
  next,
}: {
  prev?: DocNeighbor;
  next?: DocNeighbor;
}) {
  if (!prev && !next) return null;

  return (
    <nav className="border-border mt-8 grid gap-3 border-t pt-6 sm:grid-cols-2">
      {prev ? <PagerLink dir="prev" doc={prev} /> : <div />}
      {next ? <PagerLink dir="next" doc={next} /> : <div />}
    </nav>
  );
}

function PagerLink({ dir, doc }: { dir: 'prev' | 'next'; doc: DocNeighbor }) {
  const isNext = dir === 'next';
  const Icon = isNext ? ArrowRight : ArrowLeft;

  return (
    <Link
      to="/docs/$slug"
      params={{ slug: doc.slug }}
      className={`group hover:border-foreground/30 hover:bg-muted/40 border-border flex flex-col gap-1 rounded-lg border px-4 py-3 transition-colors ${
        isNext ? 'items-end text-right sm:col-start-2' : 'items-start'
      }`}
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {!isNext && <Icon className="size-3.5" aria-hidden />}
        {isNext ? m['docs.next']() : m['docs.previous']()}
        {isNext && <Icon className="size-3.5" aria-hidden />}
      </span>
      <span className="max-w-full truncate text-sm font-medium">
        {doc.title}
      </span>
    </Link>
  );
}
