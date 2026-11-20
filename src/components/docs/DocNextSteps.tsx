import { Link } from '@tanstack/react-router';
import { ArrowRight, Route } from 'lucide-react';

import {
  docLinkTarget,
  safeDocHref,
  type NextStep,
} from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';
import { DOC_FALLBACK_ICON, DOC_ICON } from '@/components/docs/doc-icons';

/**
 * The "next steps" cards at the end of a document.
 *
 * Deliberately different from the linear previous / next links: these are
 * the branches the author picked. Relative links point at another document,
 * everything else is an ordinary link.
 */
export function DocNextSteps({ steps }: { steps: NextStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <Route className="size-4" aria-hidden />
        {m['docs.next_steps']()}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={`${step.href}-${step.title}`}>
            <StepCard step={step} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepCard({ step }: { step: NextStep }) {
  const target = docLinkTarget(step.href);
  const Icon = (target && DOC_ICON[target.slug]) || DOC_FALLBACK_ICON;
  const isExternal = target === undefined;
  // The link target comes from documentation content, so its scheme is
  // validated before it ever reaches an `href` attribute.
  const href = safeDocHref(step.href);

  const className =
    'group hover:border-primary/40 hover:shadow-sm flex h-full items-start gap-3 rounded-xl border border-border bg-gradient-to-br from-primary/[0.07] to-transparent p-3.5 transition-all';

  const content = (
    <>
      <span className="text-primary group-hover:bg-primary/15 border-primary/20 bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{step.title}</span>
          {isExternal && (
            <ArrowRight
              className="text-muted-foreground size-3.5 shrink-0 -rotate-45"
              aria-hidden
            />
          )}
        </span>
        {step.description !== '' && (
          // The description may contain inline code markers; they are shown
          // as plain text.
          <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
            {step.description.replace(/`([^`]+)`/g, '$1')}
          </span>
        )}
      </span>
      <ArrowRight
        className="text-muted-foreground group-hover:text-primary mt-2 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </>
  );

  if (target === undefined) {
    // An unsafe link target keeps the card readable but drops the link.
    if (href === undefined) {
      return <div className={className}>{content}</div>;
    }

    return (
      <a
        href={href}
        className={className}
        {...(isExternal ? { rel: 'noopener noreferrer' } : {})}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to="/docs/$slug"
      params={{ slug: target.slug }}
      hash={target.hash}
      className={className}
    >
      {content}
    </Link>
  );
}
