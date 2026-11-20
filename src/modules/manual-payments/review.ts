import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { PaymentStatus } from '@/core/payment/types';
import { manualPaymentDetail, order } from '@/config/db/schema';
import { settleCheckoutOrder } from '@/modules/payment/service';

import {
  MANUAL_PAYMENT_PROVIDER,
  ManualPaymentError,
  type ManualPaymentStatus,
} from './types';

export type ReviewAction = 'approve' | 'approve_exception' | 'reject';

async function loadByOrderNo(orderNo: string) {
  const [row] = await db()
    .select({ order: order, detail: manualPaymentDetail })
    .from(order)
    .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
    .where(eq(order.orderNo, orderNo));
  if (!row) throw new ManualPaymentError('ORDER_NOT_FOUND', 'Order not found.');
  return row;
}

function isExpired(
  detail: typeof manualPaymentDetail.$inferSelect,
  now: Date
): boolean {
  return (
    detail.status === 'expired' ||
    (detail.status === 'pending_payment' &&
      detail.expiresAt.getTime() <= now.getTime())
  );
}

/**
 * Approves or rejects a manual payment.
 *
 * `approve` settles a live order through the same code path as an automated
 * provider (one atomic claim → at most one credit grant). `approve_exception`
 * is for money that arrived after the order expired; it revives the order
 * first and is the only action allowed to settle an expired one. `reject`
 * closes the order as failed without granting anything.
 */
export async function reviewManualOrder(input: {
  orderNo: string;
  action: ReviewAction;
  reviewerId: string;
  observedAmount?: number;
  externalReference?: string;
  reviewNote?: string;
}): Promise<void> {
  const now = new Date();
  const { order: existingOrder, detail } = await loadByOrderNo(input.orderNo);

  if (input.action === 'reject') {
    if (
      detail.status !== 'pending_verification' &&
      detail.status !== 'pending_payment'
    ) {
      throw new ManualPaymentError(
        'INVALID_TRANSITION',
        `Cannot reject an order in status ${detail.status}.`
      );
    }
    await db()
      .update(manualPaymentDetail)
      .set({
        status: 'rejected',
        reviewNote: input.reviewNote?.trim() || null,
        reviewedBy: input.reviewerId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(manualPaymentDetail.orderId, existingOrder.id),
          inArray(manualPaymentDetail.status, [
            'pending_verification',
            'pending_payment',
          ])
        )
      );
    await db()
      .update(order)
      .set({ status: 'failed', updatedAt: now })
      .where(
        and(
          eq(order.id, existingOrder.id),
          inArray(order.status, ['created', 'pending'])
        )
      );
    return;
  }

  const expired = isExpired(detail, now);
  // A normal approval only settles a live order; expired money needs the
  // explicit exception so a late transfer is a deliberate call.
  if (input.action === 'approve' && expired) {
    throw new ManualPaymentError(
      'ORDER_NOT_PAYABLE',
      'This order has expired; use approve_exception to settle it.'
    );
  }
  if (
    !expired &&
    detail.status !== 'pending_verification' &&
    detail.status !== 'pending_payment'
  ) {
    throw new ManualPaymentError(
      'INVALID_TRANSITION',
      `Cannot approve an order in status ${detail.status}.`
    );
  }

  // The operator names the amount they saw land. Anything but the exact
  // payable amount is refused — a near match is the likeliest human error.
  const observedAmount = input.observedAmount ?? detail.payableAmount;
  if (observedAmount !== detail.payableAmount) {
    throw new ManualPaymentError(
      'AMOUNT_MISMATCH',
      `Observed ${observedAmount} does not match payable ${detail.payableAmount}.`
    );
  }

  // Expired orders may already be projected to `failed`; bring them back to a
  // settleable state before the shared settlement path sees them.
  if (!['created', 'pending'].includes(existingOrder.status)) {
    if (input.action !== 'approve_exception') {
      throw new ManualPaymentError(
        'ORDER_NOT_PAYABLE',
        `Order status is ${existingOrder.status}.`
      );
    }
    await db()
      .update(order)
      .set({ status: 'pending', updatedAt: now })
      .where(
        and(
          eq(order.id, existingOrder.id),
          inArray(order.status, ['created', 'failed'])
        )
      );
  }

  const transactionId =
    input.externalReference?.trim() || `manual_${existingOrder.orderNo}`;
  const settledStatus: ManualPaymentStatus = 'settled';

  const { order: settledOrder } = await loadByOrderNo(input.orderNo);
  await settleCheckoutOrder(
    settledOrder,
    {
      paymentStatus: PaymentStatus.SUCCESS,
      paymentInfo: {
        transactionId,
        amount: observedAmount,
        currency: 'cny',
        paidAt: now,
        paymentAmount: observedAmount,
        paymentCurrency: 'cny',
      },
      paymentResult: { provider: MANUAL_PAYMENT_PROVIDER, transactionId },
    },
    MANUAL_PAYMENT_PROVIDER,
    (q) => [
      // Same commit as the order/credit writes: the detail can never say
      // "settled" for an order that is not paid, or the reverse.
      q
        .update(manualPaymentDetail)
        .set({
          status: settledStatus,
          observedAmount,
          externalReference: input.externalReference?.trim() || null,
          reviewNote: input.reviewNote?.trim() || null,
          reviewedBy: input.reviewerId,
          reviewedAt: now,
          settledAt: now,
          updatedAt: now,
        })
        .where(eq(manualPaymentDetail.orderId, existingOrder.id)),
    ]
  );

  const [after] = await db()
    .select({ status: order.status })
    .from(order)
    .where(eq(order.id, existingOrder.id));
  if (after?.status !== 'paid') {
    throw new ManualPaymentError(
      'INVALID_TRANSITION',
      'Order was settled by another request.'
    );
  }
}

/**
 * Refunds a settled manual order. There is no channel to call — the money
 * moves outside the app — so this is the shared refund bookkeeping (status,
 * credit rollback) plus closing the detail row as `canceled`.
 */
export async function refundManualOrder(input: {
  orderNo: string;
  operatorId: string;
  reviewNote?: string;
}): Promise<void> {
  const { refundOrder } = await import('@/modules/payment/service');
  await refundOrder({
    orderNo: input.orderNo,
    operatorId: input.operatorId,
    reason: input.reviewNote,
  });
}
