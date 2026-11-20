import { and, count, desc, eq, type SQL } from 'drizzle-orm';

import { db } from '@/core/db';
import { manualPaymentDetail, order, user } from '@/config/db/schema';
import { respData, respErr, respPage } from '@/lib/resp';
import { keywordMatch } from '@/lib/sql-search';

import type { AdminHandlerContext } from '../types';

/**
 * Orders that are waiting on an operator: the verification queue.
 * `status` filters on the detail status, which is the state a reviewer acts on.
 */
export async function GET({ request }: AdminHandlerContext) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20'))
    );
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(manualPaymentDetail.status, status));
    const keyword = keywordMatch(search, {
      contains: [order.orderNo, order.userEmail, user.email, user.name],
      exact: [order.userId, manualPaymentDetail.externalReference],
    });
    if (keyword) conditions.push(keyword);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db()
      .select({ count: count() })
      .from(order)
      .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
      .leftJoin(user, eq(order.userId, user.id))
      .where(where);

    const rows = await db()
      .select({
        orderNo: order.orderNo,
        id: order.id,
        userId: order.userId,
        userEmail: order.userEmail,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        productName: order.productName,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        userName: user.name,
        userAccountEmail: user.email,
        detail: manualPaymentDetail,
      })
      .from(order)
      .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
      .leftJoin(user, eq(order.userId, user.id))
      .where(where)
      .orderBy(desc(order.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return respPage(rows, totalResult.count);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

/** One order with its detail, for the review page. */
export async function FIND({ request }: AdminHandlerContext) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get('orderNo');
    if (!orderNo) return respErr('orderNo is required');
    const [row] = await db()
      .select({ order, detail: manualPaymentDetail, user })
      .from(order)
      .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
      .leftJoin(user, eq(order.userId, user.id))
      .where(eq(order.orderNo, orderNo));
    if (!row) return respErr('Order not found');
    return respData(row);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}
