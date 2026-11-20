import { createFileRoute } from '@tanstack/react-router';
import { runAdminRoute } from '@/server/admin/execute';

export const Route = createFileRoute('/api/admin/manual-payments/accounts')({
  server: {
    handlers: {
      GET: (context) => runAdminRoute('manual_accounts_list', context),
      POST: (context) => runAdminRoute('manual_account_create', context),
      PUT: (context) => runAdminRoute('manual_account_update', context),
      DELETE: (context) => runAdminRoute('manual_account_delete', context),
    },
  },
});
