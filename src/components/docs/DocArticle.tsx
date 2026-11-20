import type { DocHeading, DocNeighbor, NextStep } from '@/modules/docs/paths';
import { m } from '@/paraglide/messages.js';
import { DocNextSteps } from '@/components/docs/DocNextSteps';
import { DocPager } from '@/components/docs/DocPager';
import { DocsToc } from '@/components/docs/DocsToc';
import { Mdx } from '@/components/mdx/Mdx';

/** Everything needed to render one document; produced by the route loader. */
export interface DocArticleData {
  title: string;
  description: string;
  /** The body without the "next steps" section. */
  body: string;
  steps: NextStep[];
  prev: DocNeighbor | undefined;
  next: DocNeighbor | undefined;
  /** The formatted update date; empty when the document has none. */
  updated: string;
  headings: DocHeading[];
}

/**
 * A single document: title, description, update date, body, the "next
 * steps" cards and the previous / next links.
 */
export function DocArticle({ doc }: { doc: DocArticleData }) {
  return (
    <div className="mx-auto flex max-w-5xl justify-center gap-10">
      <article className="max-w-3xl min-w-0 flex-1">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        {doc.description !== '' && (
          <p className="text-muted-foreground mt-2">{doc.description}</p>
        )}
        {doc.updated !== '' && (
          <p className="text-muted-foreground mt-2 text-xs">
            {m['docs.updated']()} {doc.updated}
          </p>
        )}
        <hr className="border-border my-6" />
        <Mdx source={doc.body} />
        <DocNextSteps steps={doc.steps} />
        <DocPager prev={doc.prev} next={doc.next} />
      </article>
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 xl:block">
        <DocsToc headings={doc.headings} />
      </aside>
    </div>
  );
}
