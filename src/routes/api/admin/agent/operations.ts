import { createFileRoute } from '@tanstack/react-router';

import { respData } from '@/lib/resp';

import { authenticateAdmin } from '@/server/admin/auth';
import { operationCatalog } from '@/server/admin/discovery';
import { adminErrorResponse } from '@/server/admin/execute';

export const Route = createFileRoute('/api/admin/agent/operations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return respData(operationCatalog(await authenticateAdmin(request)), {
            headers: { 'Cache-Control': 'no-store' },
          });
        } catch (error) {
          return adminErrorResponse(error);
        }
      },
    },
  },
});
