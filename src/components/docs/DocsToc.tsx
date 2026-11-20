'use client';

import { useEffect, useState } from 'react';

import type { DocHeading } from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';

/**
 * The table of contents of a document.
 *
 * The links are plain `#id` anchors — the ids come from the same
 * `headingId` the markdown renderer uses, so they always match.
 */

/** How far a heading has to pass the top of the viewport to count as read. */
const ACTIVE_OFFSET_PX = 120;

export function DocsToc({ headings }: { headings: DocHeading[] }) {
  const activeId = useActiveHeading(headings);

  if (headings.length === 0) return null;

  return (
    <nav className="text-sm" aria-label={m['docs.on_this_page']()}>
      <p className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wide uppercase">
        {m['docs.on_this_page']()}
      </p>
      {/* h3 entries leave the vertical line with a short dash, otherwise the
          hierarchy can only be guessed from the indentation. */}
      <ul className="border-border border-l">
        {headings.map((heading) => {
          const isActive = heading.id === activeId;
          return (
            <li key={heading.id} className="relative">
              {isActive && (
                <span
                  aria-hidden
                  className="bg-primary absolute inset-y-0 -left-px w-0.5 rounded-full"
                />
              )}
              {heading.level === 3 && (
                <span
                  aria-hidden
                  className={`absolute top-1/2 left-0 h-px w-2.5 -translate-y-1/2 ${
                    isActive ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <a
                href={`#${heading.id}`}
                data-level={heading.level}
                aria-current={isActive ? 'location' : undefined}
                className={`block py-1.5 transition-colors ${
                  heading.level === 3 ? 'pl-5' : 'pl-3'
                } ${
                  // Colour alone is hard to tell apart from the hover state
                  // in the light theme, so the active entry is bold too.
                  isActive
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground font-normal'
                }`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Track the heading the visitor is reading.
 *
 * A scroll threshold instead of `IntersectionObserver`: what is needed is the
 * order relation "the last heading that has passed the top", which does not
 * jitter when two sections are visible at the same time.
 */
function useActiveHeading(headings: DocHeading[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(
    headings[0]?.id ?? null
  );

  useEffect(() => {
    if (headings.length === 0) return;

    function update() {
      const scrollHeight = document.documentElement.scrollHeight;
      // A scroll height of 0 means the page is not laid out yet — without
      // the guard the last section would be treated as "at the bottom".
      const atBottom =
        scrollHeight > 0 &&
        window.innerHeight + window.scrollY >= scrollHeight - 2;
      if (atBottom) {
        setActiveId(headings[headings.length - 1]?.id ?? null);
        return;
      }

      let current = headings[0]?.id ?? null;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= ACTIVE_OFFSET_PX)
          current = heading.id;
        else break;
      }
      setActiveId(current);
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [headings]);

  return activeId;
}
