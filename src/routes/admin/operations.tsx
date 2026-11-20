import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { AdminOperations } from '@/blocks/admin-operations';

export const Route = createFileRoute('/admin/operations')({
  loader: () => ({
    title: m['admin.operations.title']({}, { locale: getLocale() }),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminOperations,
});
