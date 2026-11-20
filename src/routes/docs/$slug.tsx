import { createFileRoute, notFound } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { getDocsEnabledFn } from '@/modules/docs/server';
import {
  docNeighbors,
  docsForLocale,
  extractHeadings,
  formatUpdatedDate,
  splitNextSteps,
} from '@/modules/docs/service';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { DocArticle } from '@/components/docs/DocArticle';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const Route = createFileRoute('/docs/$slug')({
  loader: async ({ params }) => {
    // The documentation is a module the admin can switch off — then the
    // routes do not exist at all.
    if (!(await getDocsEnabledFn())) throw notFound();

    const locale = getLocale();
    const docs = docsForLocale(locale);
    const doc = docs.find((entry) => entry.slug === params.slug);
    if (!doc) throw notFound();

    // The "next steps" section is rendered as cards, so it is cut out of
    // the body instead of being rendered twice.
    const { body, steps } = splitNextSteps(doc.content);
    const { prev, next } = docNeighbors(docs, doc.slug);

    return {
      locale,
      docs,
      slug: doc.slug,
      article: {
        title: doc.title,
        description: doc.description,
        body,
        steps,
        prev,
        next,
        updated: formatUpdatedDate(doc.updated),
        headings: extractHeadings(body),
      },
    };
  },
  head: ({ loaderData }) => {
    const article = loaderData?.article;
    if (!article) return {};
    return {
      meta: [
        { title: `${article.title} | ${envConfigs.app_name}` },
        { name: 'description', content: article.description },
      ],
    };
  },
  component: DocsArticlePage,
});

function DocsArticlePage() {
  const { docs, slug, article } = Route.useLoaderData();

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <SiteHeader />
      <DocsLayout docs={docs} activeSlug={slug}>
        <DocArticle doc={article} />
      </DocsLayout>
      <SiteFooter />
    </div>
  );
}
