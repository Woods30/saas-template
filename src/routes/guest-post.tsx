import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { GuestPostLanding } from '@/blocks/guest-post';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const Route = createFileRoute('/guest-post')({
  loader: () => {
    const locale = getLocale();
    return {
      title: m['guest_posts.landing.title']({}, { locale }),
      description: m['guest_posts.landing.description']({}, { locale }),
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: loaderData.title },
          { name: 'description', content: loaderData.description },
        ]
      : [],
  }),
  component: GuestPostPage,
});

function GuestPostPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <GuestPostLanding />
      </main>
      <SiteFooter />
    </div>
  );
}
