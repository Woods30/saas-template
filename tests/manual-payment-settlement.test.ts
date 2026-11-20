import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

// Isolated SQLite DB; no application modules load before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-settlement-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_sv7cm4pq}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_wf2kt9ha}}',
  NODE_ENV: 'test',
  VITE_APP_URL: 'http://localhost:3000',
  PRIVATE_UPLOAD_DIR: join(directory, 'uploads'),
});
execFileSync(
  process.execPath,
  [
    'node_modules/drizzle-kit/bin.cjs',
    'push',
    '--dialect=sqlite',
    '--schema=./src/config/db/schema.sqlite.ts',
    `--url=${process.env.DATABASE_URL}`,
    '--force',
  ],
  { stdio: 'pipe', env: process.env }
);

const { db } = await import('../src/core/db');
const schema = await import('../src/config/db/schema');
const { PaymentType } = await import('../src/core/payment/types');
const { saveConfigs } = await import('../src/modules/config/service');
const {
  createAccount,
  createManualOrder,
  submitReceipt,
  reviewManualOrder,
  refundManualOrder,
  ManualPaymentError,
} = await import('../src/modules/manual-payments/service');
const { getBalance } = await import('../src/modules/credits/service');

const product = {
  productId: 'manual_credits_pack',
  productName: 'Credits Pack',
  planName: 'Credits Pack',
  description: 'One-time credits',
  type: PaymentType.ONE_TIME,
  priceInCents: 9900,
  currency: 'usd',
  cnyPriceInCents: 69900,
  credits: 100,
  creditsValidDays: 0,
};

let accountReady = false;

async function makePaidCandidate(userId: string, now?: Date) {
  await db()
    .insert(schema.user)
    .values({ id: userId, name: userId, email: `${userId}@example.com` })
    .onConflictDoNothing();
  if (!accountReady) {
    await saveConfigs({ manual_payments_enabled: 'true' });
    await createAccount({
      channel: 'alipay',
      displayName: 'Payee',
      currency: 'cny',
      enabled: true,
    });
    accountReady = true;
  }
  return createManualOrder({ userId, product, now });
}

function pngFile() {
  return new File([new Uint8Array(32).fill(1)], 'r.png', { type: 'image/png' });
}

async function detailOf(orderId: string) {
  const [row] = await db()
    .select()
    .from(schema.manualPaymentDetail)
    .where(eq(schema.manualPaymentDetail.orderId, orderId));
  return row;
}

async function orderOf(orderId: string) {
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.id, orderId));
  return row;
}

async function grantCount(orderNo: string) {
  const rows = await db()
    .select({ id: schema.credit.id })
    .from(schema.credit)
    .where(eq(schema.credit.orderNo, orderNo));
  return rows.length;
}

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('approve settles the order, closes the detail and grants credits once', async () => {
  const created = await makePaidCandidate('u-approve');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-approve',
    file: pngFile(),
  });

  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'approve',
    reviewerId: 'admin-1',
    observedAmount: created.payableAmount,
    externalReference: 'ALI-123',
    reviewNote: 'matches',
  });

  const order = await orderOf(created.orderId);
  assert.equal(order.status, 'paid');
  assert.equal(order.paymentProvider, 'manual_payments');
  assert.equal(order.transactionId, 'ALI-123');

  const detail = await detailOf(created.orderId);
  assert.equal(detail.status, 'settled');
  assert.equal(detail.observedAmount, created.payableAmount);
  assert.equal(detail.externalReference, 'ALI-123');
  assert.equal(detail.reviewedBy, 'admin-1');
  assert.ok(detail.settledAt);

  assert.equal(await grantCount(created.orderNo), 1);
  assert.equal(await getBalance('u-approve'), 100);
});

test('two concurrent approvals produce exactly one grant', async () => {
  const created = await makePaidCandidate('u-race');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-race',
    file: pngFile(),
  });

  const results = await Promise.allSettled([
    reviewManualOrder({
      orderNo: created.orderNo,
      action: 'approve',
      reviewerId: 'admin-a',
      observedAmount: created.payableAmount,
    }),
    reviewManualOrder({
      orderNo: created.orderNo,
      action: 'approve',
      reviewerId: 'admin-b',
      observedAmount: created.payableAmount,
    }),
  ]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  assert.equal(await grantCount(created.orderNo), 1);
  assert.equal(await getBalance('u-race'), 100);
  assert.equal((await detailOf(created.orderId)).status, 'settled');
});

test('an amount mismatch refuses to settle', async () => {
  const created = await makePaidCandidate('u-mismatch');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-mismatch',
    file: pngFile(),
  });

  await assert.rejects(
    reviewManualOrder({
      orderNo: created.orderNo,
      action: 'approve',
      reviewerId: 'admin-1',
      observedAmount: created.payableAmount - 1,
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'AMOUNT_MISMATCH'
  );

  assert.equal((await orderOf(created.orderId)).status, 'pending');
  assert.equal(
    (await detailOf(created.orderId)).status,
    'pending_verification'
  );
  assert.equal(await grantCount(created.orderNo), 0);
});

test('an expired order needs an explicit exception to be approved', async () => {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const created = await makePaidCandidate('u-exception', past);

  await assert.rejects(
    reviewManualOrder({
      orderNo: created.orderNo,
      action: 'approve',
      reviewerId: 'admin-1',
      observedAmount: created.payableAmount,
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'ORDER_NOT_PAYABLE'
  );

  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'approve_exception',
    reviewerId: 'admin-1',
    observedAmount: created.payableAmount,
    reviewNote: 'money arrived late',
  });
  assert.equal((await orderOf(created.orderId)).status, 'paid');
  assert.equal((await detailOf(created.orderId)).status, 'settled');
  assert.equal(await grantCount(created.orderNo), 1);
});

test('reject closes the detail and fails the order', async () => {
  const created = await makePaidCandidate('u-reject');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-reject',
    file: pngFile(),
  });

  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'reject',
    reviewerId: 'admin-1',
    reviewNote: 'screenshot is a different amount',
  });
  assert.equal((await orderOf(created.orderId)).status, 'failed');
  assert.equal((await detailOf(created.orderId)).status, 'rejected');
  assert.equal(await grantCount(created.orderNo), 0);
});

test('a rejected order can still be settled with an exception', async () => {
  const created = await makePaidCandidate('u-revive');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-revive',
    file: pngFile(),
  });
  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'reject',
    reviewerId: 'admin-1',
    reviewNote: 'looked like the wrong amount',
  });
  assert.equal((await detailOf(created.orderId)).status, 'rejected');

  // The bank statement later shows the money did arrive; the operator must be
  // able to correct the mistake without a second order.
  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'approve_exception',
    reviewerId: 'admin-1',
    observedAmount: created.payableAmount,
    reviewNote: 'bank statement confirms the transfer',
  });

  assert.equal((await orderOf(created.orderId)).status, 'paid');
  assert.equal((await detailOf(created.orderId)).status, 'settled');
  assert.equal(await grantCount(created.orderNo), 1);
});

test('refunding a manual order rolls credits back exactly once', async () => {
  const created = await makePaidCandidate('u-refund');
  await submitReceipt({
    orderNo: created.orderNo,
    userId: 'u-refund',
    file: pngFile(),
  });
  await reviewManualOrder({
    orderNo: created.orderNo,
    action: 'approve',
    reviewerId: 'admin-1',
    observedAmount: created.payableAmount,
  });
  assert.equal(await getBalance('u-refund'), 100);

  await refundManualOrder({
    orderNo: created.orderNo,
    operatorId: 'admin-1',
    reviewNote: 'customer changed their mind',
  });

  const order = await orderOf(created.orderId);
  assert.equal(order.status, 'refunded');
  assert.equal((await detailOf(created.orderId)).status, 'canceled');
  assert.equal(await getBalance('u-refund'), 0);

  await assert.rejects(
    refundManualOrder({ orderNo: created.orderNo, operatorId: 'admin-1' }),
    /Only paid orders can be refunded|already in progress/
  );
  assert.equal(await getBalance('u-refund'), 0);
});
