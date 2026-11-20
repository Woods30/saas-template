import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { atomic, guard } from '@/core/db/atomic';
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
import { canEncryptObjects, decryptBytes, encryptBytes } from '@/lib/crypto';
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

/** Suffix marking an object whose bytes are encrypted at rest. */
const ENCRYPTED_SUFFIX = '.enc';

/**
 * Writes an object to private storage: R2 when configured, otherwise the
 * local-disk provider under `data/uploads/` — never `public/`.
 *
 * "Private" is only true for the storage itself when the bucket has no public
 * domain. With a public domain anyone holding the key can fetch the object,
 * so the bytes are encrypted with CONFIG_ENCRYPTION_KEY; if that key is
 * missing the upload is refused rather than written in the clear.
 */
export async function putPrivateObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ key: string }> {
  const storage = await getStorage();
  const provider = storage ?? new LocalPrivateProvider();
  const exposesPublicUrl = storage ? storage.isPubliclyReadable() : false;

  let key = input.key;
  let body = input.body;
  let contentType = input.contentType;

  if (canEncryptObjects()) {
    body = await encryptBytes(input.body);
    key = `${input.key}${ENCRYPTED_SUFFIX}`;
    // The stored bytes are ciphertext, so the object carries no usable type.
    contentType = 'application/octet-stream';
  } else if (exposesPublicUrl) {
    throw new ManualPaymentError(
      'RECEIPT_STORAGE_NOT_PRIVATE',
      'Receipts cannot be stored securely: set CONFIG_ENCRYPTION_KEY or remove the storage public domain.'
    );
  }

  const result = await provider.uploadFile({ key, body, contentType });
  if (!result.success) {
    throw new Error(result.error || 'Receipt upload failed');
  }
  return { key };
}

/**
 * Reads an object back, decrypting it when it was stored encrypted. The
 * content type comes from the inner name (`x.png.enc` is a PNG) so a caller
 * never has to know whether encryption was on at write time.
 */
export async function readPrivateObject(
  key: string
): Promise<StorageObject | null> {
  const storage = await getStorage();
  const object = storage
    ? await storage.getObject({ key })
    : await new LocalPrivateProvider().getObject({ key });
  if (!object) return null;
  if (!key.endsWith(ENCRYPTED_SUFFIX)) return object;

  const inner = key.slice(0, -ENCRYPTED_SUFFIX.length);
  try {
    return {
      body: await decryptBytes(object.body),
      contentType: contentTypeFromKey(inner),
    };
  } catch {
    // A wrong or missing key must not surface ciphertext as the image.
    return null;
  }
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
  const { key: receiptKey } = await putPrivateObject({
    key: receiptKeyFor(found.orderId, ext),
    body,
    contentType: input.file.type,
  });

  const payerNote = input.payerNote?.trim() || null;
  try {
    await attachReceipt({
      orderId: found.orderId,
      receiptKey,
      payerNote,
      now,
    });
  } catch (error) {
    // The order changed between the read and the write (expiry, another
    // upload, a rejection): answer with the same message the read path uses,
    // and let the caller drop the orphaned object.
    throw new ManualPaymentError(
      'ORDER_NOT_PAYABLE',
      'This order is no longer waiting for payment.'
    );
  }

  return { receiptKey };
}

/**
 * The atomic half of {@link submitReceipt}.
 *
 * Both rows move in one commit and only while the order is still waiting for
 * payment: the detail update matches `pending_payment`, and a guard re-checks
 * that it landed before the order row is touched. Without the guard, an
 * expiry that raced the read leaves the detail `expired` and the order
 * `pending` — a pair that no later code path repairs.
 */
export async function attachReceipt(input: {
  orderId: string;
  receiptKey: string;
  payerNote: string | null;
  now: Date;
}): Promise<void> {
  const { orderId, receiptKey, payerNote, now } = input;
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
      // that raced the read, must not overwrite the first receipt.
      .where(
        and(
          eq(manualPaymentDetail.orderId, orderId),
          eq(manualPaymentDetail.status, 'pending_payment')
        )
      ),
    guard({
      table: manualPaymentDetail,
      column: 'userId',
      where: eq(manualPaymentDetail.orderId, orderId),
      require: sql`${manualPaymentDetail.status} = 'pending_verification'`,
      message: 'This order is no longer waiting for payment.',
    }),
    q
      .update(order)
      .set({ status: 'pending', updatedAt: now })
      .where(
        and(
          eq(order.id, orderId),
          inArray(order.status, ['created', 'pending'])
        )
      ),
  ]);
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
