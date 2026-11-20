import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  isManualPaymentAdmin,
  openReceipt,
} from '@/modules/manual-payments/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/payment/manual/receipt/<orderNo>
 *
 * Owner or admin only. Every other outcome — signed out, someone else's
 * order, an order that does not exist, an order with no receipt — is a bare
 * 404 so the response never confirms whether an order exists.
 */
async function GET({
  request,
  params,
}: {
  request: Request;
  params: { orderNo: string };
}) {
  const notFound = () => new Response('Not found', { status: 404 });

  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 500,
    keyPrefix: 'manual-receipt-read',
  });
  if (limited) return limited;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return notFound();

  const isAdmin = await isManualPaymentAdmin(session.user.id);
  const object = await openReceipt({
    orderNo: params.orderNo,
    userId: session.user.id,
    isAdmin,
  });
  if (!object) return notFound();

  return new Response(object.body as unknown as BodyInit, {
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.body.length),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const Route = createFileRoute('/api/payment/manual/receipt/$orderNo')({
  server: {
    handlers: { GET },
  },
});
