import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { atomic } from '@/core/db/atomic';
import {
  contentTypeFromKey,
  LocalPrivateProvider,
  type StorageObject,
} from '@/core/storage';
import { manualPaymentDetail, order } from '@/config/db/schema';
import {
  getUserPermissionCodes,
  isAdminPermission,
} from '@/modules/rbac/service';
import { getStorage } from '@/modules/storage/service';
import { getUuid } from '@/lib/hash';

import { ManualPaymentError } from './types';

/** Cap for one receipt image. Same limit as the public image upload route. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/**
 * Raster formats only — SVG is refused because it can carry script and would
 * run on whatever origin serves it.
 */
const RECEIPT_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Receipts live under their own private prefix, never a public one. */
export function receiptKeyFor(orderId: string, ext: string): string {
  return `manual-receipts/${orderId}/${getUuid()}.${ext}`;
}

/**
 * Writes an object to private storage: R2 when configured, otherwise the
 * local-disk provider under `data/uploads/` — never `public/`.
 */
export async function putPrivateObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  const storage = await getStorage();
  const provider = storage ?? new LocalPrivateProvider();
  const result = await provider.uploadFile({
    key: input.key,
    body: input.body,
    contentType: input.contentType,
  });
  if (!result.success) {
    throw new Error(result.error || 'Receipt upload failed');
  }
}

export async function readPrivateObject(
  key: string
): Promise<StorageObject | null> {
  const storage = await getStorage();
  if (storage) return storage.getObject({ key });
  return new LocalPrivateProvider().getObject({ key });
}

async function findDetailByOrderNo(orderNo: string) {
  const [row] = await db()
    .select({
      detail: manualPaymentDetail,
      orderId: order.id,
      orderStatus: order.status,
    })
    .from(order)
    .innerJoin(manualPaymentDetail, eq(manualPaymentDetail.orderId, order.id))
    .where(eq(order.orderNo, orderNo));
  return row ?? null;
}

/**
 * Attaches a payer's receipt to their own order. Refuses anything that is not
 * a raster image within `MAX_RECEIPT_BYTES`, and only accepts orders that are
 * still waiting for payment (an expired order cannot be revived).
 */
export async function submitReceipt(input: {
  orderNo: string;
  userId: string;
  file: File;
  payerNote?: string;
  now?: Date;
}): Promise<{ receiptKey: string }> {
  const now = input.now ?? new Date();
  const ext = RECEIPT_MIME_EXT[input.file.type];
  if (!ext) {
    throw new ManualPaymentError(
      'RECEIPT_REQUIRED',
      'Receipt must be a raster image (jpg, png, webp, gif, avif, heic).'
    );
  }
  if (input.file.size <= 0 || input.file.size > MAX_RECEIPT_BYTES) {
    throw new ManualPaymentError(
      'RECEIPT_REQUIRED',
      'Receipt must be between 1 byte and 10MB.'
    );
  }

  const found = await findDetailByOrderNo(input.orderNo);
  // Someone else's order is indistinguishable from one that does not exist.
  if (!found || found.detail.userId !== input.userId) {
    throw new ManualPaymentError('ORDER_NOT_FOUND', 'Order not found.');
  }
  if (
    found.detail.status !== 'pending_payment' ||
    found.detail.expiresAt.getTime() <= now.getTime()
  ) {
    throw new ManualPaymentError(
      'ORDER_NOT_PAYABLE',
      'This order is no longer waiting for payment.'
    );
  }

  const body = new Uint8Array(await input.file.arrayBuffer());
  const receiptKey = receiptKeyFor(found.orderId, ext);
  await putPrivateObject({
    key: receiptKey,
    body,
    contentType: input.file.type,
  });

  const payerNote = input.payerNote?.trim() || null;
  await atomic((q) => [
    q
      .update(manualPaymentDetail)
      .set({
        status: 'pending_verification',
        receiptKey,
        payerNote,
        submittedAt: now,
        updatedAt: now,
      })
      // Only from pending_payment: a second concurrent upload, or an expiry
      // that raced the read above, must not overwrite the first receipt.
      .where(
        and(
          eq(manualPaymentDetail.orderId, found.orderId),
          eq(manualPaymentDetail.status, 'pending_payment')
        )
      ),
    q
      .update(order)
      .set({ status: 'pending', updatedAt: now })
      .where(eq(order.id, found.orderId)),
  ]);

  return { receiptKey };
}

/**
 * Streams a receipt back to its owner or an admin. Every other case returns
 * null so the route can answer 404 — a 403 would confirm the order exists.
 */
export async function openReceipt(input: {
  orderNo: string;
  userId: string;
  isAdmin: boolean;
}): Promise<StorageObject | null> {
  const found = await findDetailByOrderNo(input.orderNo);
  if (!found || !found.detail.receiptKey) return null;
  if (!input.isAdmin && found.detail.userId !== input.userId) return null;

  const object = await readPrivateObject(found.detail.receiptKey);
  if (!object) return null;
  return {
    body: object.body,
    contentType:
      object.contentType && object.contentType !== 'application/octet-stream'
        ? object.contentType
        : contentTypeFromKey(found.detail.receiptKey),
  };
}
/** Whether a user may read any order's receipt (admin panel permission). */
export async function isManualPaymentAdmin(userId: string): Promise<boolean> {
  const codes = await getUserPermissionCodes(userId);
  return codes.some((code) => isAdminPermission(code));
}
