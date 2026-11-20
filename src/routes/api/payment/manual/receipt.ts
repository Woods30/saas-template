import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  ManualPaymentError,
  MAX_RECEIPT_BYTES,
  submitReceipt,
} from '@/modules/manual-payments/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

export const MAX_RECEIPT_REQUEST_BYTES = MAX_RECEIPT_BYTES + 64 * 1024;

/**
 * POST /api/payment/manual/receipt
 *
 * Multipart form: `order_no`, optional `payer_note`, one `file`. The caller
 * must own the order; the stored object never gets a public URL.
 */
async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'manual-receipt',
  });
  if (limited) return limited;

  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized');

    const userLimited = enforceMinIntervalRateLimit(request, {
      intervalMs: 1000,
      keyPrefix: 'manual-receipt',
      extraKey: session.user.id,
    });
    if (userLimited) return userLimited;

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_RECEIPT_REQUEST_BYTES) {
      return respErr('Receipt is larger than 10MB');
    }

    const formData = await request.formData();
    const orderNo = formData.get('order_no');
    if (typeof orderNo !== 'string' || !orderNo) {
      return respErr('Missing order_no');
    }
    const file = formData.get('file');
    if (!(file instanceof File)) return respErr('Missing receipt file');
    const payerNote = formData.get('payer_note');

    const { receiptKey } = await submitReceipt({
      orderNo,
      userId: session.user.id,
      file,
      payerNote: typeof payerNote === 'string' ? payerNote : undefined,
    });
    return respData({ receiptKey });
  } catch (error) {
    if (error instanceof ManualPaymentError) {
      if (error.code === 'ORDER_NOT_FOUND') {
        return respErr('Order not found', { status: 404 });
      }
      if (error.code === 'ORDER_NOT_PAYABLE') {
        return respErr(error.message, { status: 409 });
      }
      return respErr(error.message, { status: 400 });
    }
    console.error('manual receipt upload failed:', error);
    return respErr('Receipt upload failed', { status: 500 });
  }
}

export const Route = createFileRoute('/api/payment/manual/receipt')({
  server: {
    handlers: { POST },
  },
});
