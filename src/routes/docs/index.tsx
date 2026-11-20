import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { FileText } from 'lucide-react';

import { envConfigs } from '@/config';
import { getDocsEnabledFn } from '@/modules/docs/server';
import { docsForLocale } from '@/modules/docs/service';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const Route = createFileRoute('/docs/')({
  loader: async () => {
    // The documentation is a module the admin can switch off — then the
    // routes do not exist at all.
    if (!(await getDocsEnabledFn())) throw notFound();

    const locale = getLocale();
    return { locale, docs: docsForLocale(locale) };
  },
  head: () => ({
    meta: [
      { title: `${m['docs.title']()} | ${envConfigs.app_name}` },
      { name: 'description', content: m['docs.description']() },
    ],
  }),
  component: DocsIndexPage,
});

function DocsIndexPage() {
  const { docs } = Route.useLoaderData();

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <SiteHeader />
      <DocsLayout docs={docs}>
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight">
            {m['docs.title']()}
          </h1>
          <p className="text-muted-foreground mt-2">
            {m['docs.description']()}
          </p>

          {docs.length === 0 ? (
            <p className="text-muted-foreground mt-10 text-sm">
              {m['docs.empty']()}
            </p>
          ) : (
            <ul className="mt-8 space-y-3">
              {docs.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    to="/docs/$slug"
                    params={{ slug: doc.slug }}
                    className="hover:border-foreground/30 hover:bg-muted/40 border-border flex items-start gap-3 rounded-xl border p-4 transition-colors"
                  >
                    <FileText
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{doc.title}</span>
                      {doc.description !== '' && (
                        <span className="text-muted-foreground mt-0.5 block text-sm">
                          {doc.description}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DocsLayout>
      <SiteFooter />
    </div>
  );
}
