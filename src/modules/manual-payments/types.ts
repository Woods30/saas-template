/**
 * Manual ("核销") payments: the payer transfers money to a collection account
 * out of band and an operator verifies the receipt. Only one-time products are
 * sold this way; subscriptions stay on the automated providers.
 */

export const MANUAL_PAYMENT_PROVIDER = 'manual_payments';

/** Root amount + fingerprint must stay inside 1–99 so no two live orders clash. */
export const FINGERPRINT_MIN = 1;
export const FINGERPRINT_MAX = 99;

/** How long a created order waits for a receipt before it expires. */
export const MANUAL_PAYMENT_TTL_MS = 15 * 60 * 1000;

export type ManualPaymentStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'settling'
  | 'settled'
  | 'expired'
  | 'canceled'
  | 'rejected'
  | 'requires_refund';

/** Statuses that hold their amount on the account (see the partial index). */
export const ACTIVE_MANUAL_PAYMENT_STATUSES: readonly ManualPaymentStatus[] = [
  'pending_payment',
  'pending_verification',
  'settling',
];

export type ManualPaymentErrorCode =
  | 'MODULE_DISABLED'
  | 'INVALID_OFFER'
  | 'NO_MANUAL_PAYMENT_ACCOUNT'
  | 'AMOUNT_POOL_EXHAUSTED'
  | 'AMOUNT_MISMATCH'
  | 'ACCOUNT_IN_USE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_PAYABLE'
  | 'INVALID_TRANSITION'
  | 'RECEIPT_REQUIRED';

export class ManualPaymentError extends Error {
  readonly code: ManualPaymentErrorCode;

  constructor(code: ManualPaymentErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ManualPaymentError';
    this.code = code;
  }
}

/** Cross-dialect "this row already exists" check, for amount allocation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: any = error;
  for (let i = 0; current && i < 5; i++, current = current.cause) {
    const text = `${current.code ?? ''} ${current.message ?? ''}`;
    if (
      /UNIQUE constraint failed|duplicate key value|ER_DUP_ENTRY|SQLITE_CONSTRAINT/i.test(
        text
      )
    ) {
      return true;
    }
  }
  return false;
}
