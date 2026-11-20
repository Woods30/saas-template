/**
 * Manual payments module — public surface.
 *
 * The implementation is split by responsibility: `types.ts` holds the shared
 * constants and error codes, `accounts.ts` the collection-account CRUD, and
 * `orders.ts` order creation and expiry. Later tasks add receipts and review.
 */
export * from './types';
export * from './accounts';
export * from './orders';
export * from './receipts';
export * from './review';
