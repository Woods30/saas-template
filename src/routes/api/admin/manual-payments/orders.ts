import { createFileRoute } from '@tanstack/react-router';

import { runAdminRoute } from '@/server/admin/execute';

export const Route = createFileRoute('/api/admin/manual-payments/orders')({
  server: {
    handlers: {
      GET: (context) => runAdminRoute('manual_orders_list', context),
    },
  },
});
