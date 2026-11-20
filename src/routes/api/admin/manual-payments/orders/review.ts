import { createFileRoute } from '@tanstack/react-router';
import { runAdminRoute } from '@/server/admin/execute';

export const Route = createFileRoute(
  '/api/admin/manual-payments/orders/review'
)({
  server: {
    handlers: {
      POST: (context) => runAdminRoute('manual_order_review', context),
    },
  },
});
