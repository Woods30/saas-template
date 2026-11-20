import { createFileRoute } from '@tanstack/react-router';
import { runAdminRoute } from '@/server/admin/execute';

import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';

function run(name: string, context: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(context.request, {
    intervalMs: 200,
    keyPrefix: 'footer-badges-ip',
  });
  return limited ?? runAdminRoute(name, context);
}

export const Route = createFileRoute('/api/admin/footer-badges')({
  server: {
    handlers: {
      GET: (context) => run('footer_badges_get', context),
      POST: (context) => run('footer_badges_update', context),
    },
  },
});
