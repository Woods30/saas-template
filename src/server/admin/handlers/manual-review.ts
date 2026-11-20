import {
  ManualPaymentError,
  refundManualOrder,
  reviewManualOrder,
} from '@/modules/manual-payments/service';
import { respData, respErr } from '@/lib/resp';

import type { AdminHandlerContext } from '../types';

function failure(error: unknown) {
  if (error instanceof ManualPaymentError) {
    const status =
      error.code === 'ORDER_NOT_FOUND'
        ? 404
        : error.code === 'INVALID_TRANSITION' ||
            error.code === 'ORDER_NOT_PAYABLE'
          ? 409
          : 400;
    return respErr(error.message, { status });
  }
  return respErr(error instanceof Error ? error.message : 'Internal error', {
    status: 500,
  });
}

export async function POST({ request, actor }: AdminHandlerContext) {
  try {
    const input = await request.json();
    await reviewManualOrder({
      orderNo: input.orderNo,
      action: input.action,
      reviewerId: actor.userId,
      observedAmount: input.observedAmount,
      externalReference: input.externalReference,
      reviewNote: input.reviewNote,
    });
    return respData({ orderNo: input.orderNo, action: input.action });
  } catch (error) {
    return failure(error);
  }
}

export async function REFUND({ request, actor }: AdminHandlerContext) {
  try {
    const input = await request.json();
    await refundManualOrder({
      orderNo: input.orderNo,
      operatorId: actor.userId,
      reviewNote: input.reviewNote,
    });
    return respData({ orderNo: input.orderNo });
  } catch (error) {
    return failure(error);
  }
}
