import { and, eq, inArray, lt } from 'drizzle-orm';

import { db } from '@/core/db';
import { atomic } from '@/core/db/atomic';
import { PaymentType } from '@/core/payment/types';
import { manualPaymentDetail, order } from '@/config/db/schema';
import { getPricingProduct, type PricingProduct } from '@/config/pricing';
import { getAllConfigs } from '@/modules/config/service';
import { getUniSeq, getUuid } from '@/lib/hash';

import { getAccount, listEnabledAccounts, resolveQrImageUrl } from './accounts';
import {
  ACTIVE_MANUAL_PAYMENT_STATUSES,
  FINGERPRINT_MAX,
  FINGERPRINT_MIN,
  isUniqueViolation,
  MANUAL_PAYMENT_PROVIDER,
  MANUAL_PAYMENT_TTL_MS,
  ManualPaymentError,
} from './types';

export type CreateManualOrderInput = {
  userId: string;
  userEmail?: string;
  /** Accepts a catalog product or its id; prices always come from the catalog. */
  product: PricingProduct | string;
  accountId?: string;
  now?: Date;
};

export type CreatedManualOrder = {
  orderId: string;
  orderNo: string;
  payableAmount: number;
  currency: 'cny';
  qrImageUrl: string | null;
  expiresAt: Date;
};

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function resolveProduct(
  product: PricingProduct | string
): PricingProduct | null {
  if (typeof product === 'string') return getPricingProduct(product);
  return getPricingProduct(product.productId) ?? product;
}

/**
 * Closes every order on `accountId` whose TTL passed: detail → `expired`,
 * order → `failed` (the projection in the spec's status table). Returns the
 * number of detail rows expired; those amounts become allocatable again.
 */
export async function expireStaleOrders(
  accountId: string,
  now: Date = new Date()
): Promise<number> {
  const stale = await db()
    .select({ orderId: manualPaymentDetail.orderId })
    .from(manualPaymentDetail)
    .where(
      and(
        eq(manualPaymentDetail.accountId, accountId),
        eq(manualPaymentDetail.status, 'pending_payment'),
        lt(manualPaymentDetail.expiresAt, now)
      )
    );
  if (stale.length === 0) return 0;

  const ids = stale.map((row: { orderId: string }) => row.orderId);
  await atomic((q) => [
    q
      .update(manualPaymentDetail)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(manualPaymentDetail.accountId, accountId),
          eq(manualPaymentDetail.status, 'pending_payment'),
          lt(manualPaymentDetail.expiresAt, now)
        )
      ),
    q
      .update(order)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(inArray(order.id, ids)),
  ]);
  return ids.length;
}

/**
 * Creates a pending manual-payment order: an `order` row plus its 1:1 detail,
 * priced at the catalog's CNY amount plus a 1–99 fen fingerprint that keeps
 * live orders on one account distinguishable by amount alone.
 *
 * The (accountId, payableAmount) partial unique index is the arbiter: two
 * concurrent calls that pick the same fingerprint cannot both commit, and the
 * loser simply moves to the next candidate.
 */
export async function createManualOrder(
  input: CreateManualOrderInput
): Promise<CreatedManualOrder> {
  const now = input.now ?? new Date();
  const configs = await getAllConfigs();
  if (configs.manual_payments_enabled !== 'true') {
    throw new ManualPaymentError(
      'MODULE_DISABLED',
      'Manual payments are not enabled.'
    );
  }

  const product = resolveProduct(input.product);
  if (
    !product ||
    product.type !== PaymentType.ONE_TIME ||
    !product.cnyPriceInCents
  ) {
    throw new ManualPaymentError(
      'INVALID_OFFER',
      'Manual payments only sell one-time products with a CNY price.'
    );
  }

  const account = input.accountId
    ? await getAccount(input.accountId)
    : (await listEnabledAccounts())[0];
  if (!account || !account.enabled) {
    throw new ManualPaymentError(
      'NO_MANUAL_PAYMENT_ACCOUNT',
      'No enabled collection account.'
    );
  }

  // Amounts held by expired orders are free again before allocation.
  await expireStaleOrders(account.id, now);

  const taken = new Set(
    (
      await db()
        .select({ payableAmount: manualPaymentDetail.payableAmount })
        .from(manualPaymentDetail)
        .where(
          and(
            eq(manualPaymentDetail.accountId, account.id),
            inArray(manualPaymentDetail.status, [
              ...ACTIVE_MANUAL_PAYMENT_STATUSES,
            ])
          )
        )
    ).map((row: { payableAmount: number }) => row.payableAmount)
  );

  const baseAmount = product.cnyPriceInCents;
  const candidates: number[] = [];
  for (
    let fingerprint = FINGERPRINT_MIN;
    fingerprint <= FINGERPRINT_MAX;
    fingerprint++
  ) {
    if (!taken.has(baseAmount + fingerprint)) candidates.push(fingerprint);
  }
  if (candidates.length === 0) {
    throw new ManualPaymentError(
      'AMOUNT_POOL_EXHAUSTED',
      'Every amount on this account is already in use.'
    );
  }

  const expiresAt = new Date(now.getTime() + MANUAL_PAYMENT_TTL_MS);
  const qrImageUrl = await resolveQrImageUrl(account.qrImageKey);

  for (const fingerprint of shuffle(candidates)) {
    const orderId = getUuid();
    const orderNo = getUniSeq('ORD');
    const payableAmount = baseAmount + fingerprint;
    try {
      await atomic((q) => [
        q.insert(order).values({
          id: orderId,
          orderNo,
          userId: input.userId,
          userEmail: input.userEmail || '',
          // Spec §8.2: pending_payment projects to the order status `created`.
          status: 'created',
          amount: payableAmount,
          currency: 'cny',
          productId: product.productId,
          productName: product.productName,
          planName: product.planName,
          description: product.description,
          paymentType: 'one-time',
          paymentProvider: MANUAL_PAYMENT_PROVIDER,
          checkoutInfo: JSON.stringify({
            productId: product.productId,
            accountId: account.id,
          }),
        }),
        q.insert(manualPaymentDetail).values({
          orderId,
          userId: input.userId,
          accountId: account.id,
          fingerprint,
          baseAmount,
          payableAmount,
          currency: 'cny',
          status: 'pending_payment',
          expiresAt,
        }),
      ]);
      return {
        orderId,
        orderNo,
        payableAmount,
        currency: 'cny',
        qrImageUrl,
        expiresAt,
      };
    } catch (error) {
      // Lost the race for this amount: try the next candidate.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new ManualPaymentError(
    'AMOUNT_POOL_EXHAUSTED',
    'Every amount on this account is already in use.'
  );
}
