import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { manualPaymentDetail, order } from '@/config/db/schema';
import {
  getAccount,
  resolveQrImageUrl,
} from '@/modules/manual-payments/service';
import { respData, respErr } from '@/lib/resp';

/**
 * GET /api/user/orders/<orderNo>
 *
 * One manual-payment order, for the in-app payment page. Only the owner sees
 * it; anyone else gets the same "not found" a missing order gets.
 */
async function GET({
  request,
  params,
}: {
  request: Request;
  params: { orderNo: string };
}) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });

    const [row] = await db()
      .select({ order, detail: manualPaymentDetail })
      .from(order)
      .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
      .where(
        and(
          eq(order.orderNo, params.orderNo),
          eq(order.userId, session.user.id)
        )
      );
    if (!row) return respErr('Order not found', { status: 404 });

    const account = await getAccount(row.detail.accountId);
    const qrImageUrl = await resolveQrImageUrl(account?.qrImageKey);

    return respData({
      orderNo: row.order.orderNo,
      status: row.order.status,
      amount: row.order.amount,
      currency: row.order.currency,
      productName: row.order.productName,
      planName: row.order.planName,
      createdAt: row.order.createdAt,
      paidAt: row.order.paidAt,
      detail: {
        status: row.detail.status,
        fingerprint: row.detail.fingerprint,
        baseAmount: row.detail.baseAmount,
        payableAmount: row.detail.payableAmount,
        payerNote: row.detail.payerNote,
        receiptKey: row.detail.receiptKey,
        submittedAt: row.detail.submittedAt,
        expiresAt: row.detail.expiresAt,
        settledAt: row.detail.settledAt,
        reviewNote: row.detail.reviewNote,
      },
      account: account
        ? {
            displayName: account.displayName,
            channel: account.channel,
            qrImageUrl,
          }
        : null,
    });
  } catch (error: any) {
    return respErr(error.message || 'Internal error', { status: 500 });
  }
}

export const Route = createFileRoute('/api/user/orders/$orderNo')({
  server: {
    handlers: { GET },
  },
});
