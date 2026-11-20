import { createFileRoute } from '@tanstack/react-router';
import { runAdminRoute } from '@/server/admin/execute';

export const Route = createFileRoute('/api/admin/operations/experiments')({
  server: {
    handlers: {
      GET: (context) => runAdminRoute('operations_experiments_list', context),
      POST: (context) =>
        runAdminRoute('operations_experiments_create', context),
      PATCH: (context) =>
        runAdminRoute('operations_experiments_conclude', context),
    },
  },
});
