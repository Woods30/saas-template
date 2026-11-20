import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

// Isolated SQLite DB and private upload directory; no application modules load
// before the environment is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-receipts-'));
const uploadDir = join(directory, 'uploads');
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_rn5wb8tk}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_jd3qm6ys}}',
  NODE_ENV: 'test',
  VITE_APP_URL: 'http://localhost:3000',
  PRIVATE_UPLOAD_DIR: uploadDir,
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
  openReceipt,
  ManualPaymentError,
  MAX_RECEIPT_BYTES,
} = await import('../src/modules/manual-payments/service');

const product = {
  productId: 'ebook_lifetime',
  productName: 'Ebook',
  planName: 'Ebook',
  description: 'Ebook Lifetime',
  type: PaymentType.ONE_TIME,
  priceInCents: 9900,
  currency: 'usd',
  cnyPriceInCents: 69900,
  credits: 0,
};

async function makeOrder(userId: string, now?: Date) {
  await db()
    .insert(schema.user)
    .values({ id: userId, name: userId, email: `${userId}@example.com` })
    .onConflictDoNothing();
  return createManualOrder({ userId, product, now });
}

function pngFile(bytes = 64) {
  return new File([new Uint8Array(bytes).fill(7)], 'receipt.png', {
    type: 'image/png',
  });
}

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('the owner uploads a receipt and it moves to pending verification', async () => {
  await saveConfigs({ manual_payments_enabled: 'true' });
  await createAccount({
    channel: 'alipay',
    displayName: 'Payee',
    currency: 'cny',
    enabled: true,
  });
  const order = await makeOrder('u-owner');

  const { receiptKey } = await submitReceipt({
    orderNo: order.orderNo,
    userId: 'u-owner',
    file: pngFile(),
    payerNote: 'paid from alipay',
  });
  assert.ok(receiptKey);

  const [detail] = await db()
    .select()
    .from(schema.manualPaymentDetail)
    .where(eq(schema.manualPaymentDetail.orderId, order.orderId));
  assert.equal(detail.status, 'pending_verification');
  assert.equal(detail.receiptKey, receiptKey);
  assert.equal(detail.payerNote, 'paid from alipay');
  assert.ok(detail.submittedAt);

  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.id, order.orderId));
  assert.equal(row.status, 'pending');
});

test('only the owner or an admin can read the receipt; others get null', async () => {
  const order = await makeOrder('u-reader');
  await submitReceipt({
    orderNo: order.orderNo,
    userId: 'u-reader',
    file: pngFile(128),
  });

  const mine = await openReceipt({
    orderNo: order.orderNo,
    userId: 'u-reader',
    isAdmin: false,
  });
  assert.ok(mine);
  assert.equal(mine.contentType, 'image/png');
  assert.equal(mine.body.length, 128);

  assert.equal(
    await openReceipt({
      orderNo: order.orderNo,
      userId: 'u-stranger',
      isAdmin: false,
    }),
    null
  );
  assert.equal(
    await openReceipt({
      orderNo: 'ORD-does-not-exist',
      userId: 'u-reader',
      isAdmin: false,
    }),
    null
  );

  const asAdmin = await openReceipt({
    orderNo: order.orderNo,
    userId: 'some-admin',
    isAdmin: true,
  });
  assert.ok(asAdmin);
  assert.equal(asAdmin.body.length, 128);
});

test("another user cannot attach a receipt to someone else's order", async () => {
  const order = await makeOrder('u-owner-2');
  await assert.rejects(
    submitReceipt({
      orderNo: order.orderNo,
      userId: 'u-thief',
      file: pngFile(),
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'ORDER_NOT_FOUND'
  );
});

test('svg, non-images and files over 10MB are refused', async () => {
  const order = await makeOrder('u-types');

  await assert.rejects(
    submitReceipt({
      orderNo: order.orderNo,
      userId: 'u-types',
      file: new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'RECEIPT_REQUIRED'
  );
  await assert.rejects(
    submitReceipt({
      orderNo: order.orderNo,
      userId: 'u-types',
      file: new File(['hello'], 'x.txt', { type: 'text/plain' }),
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'RECEIPT_REQUIRED'
  );
  await assert.rejects(
    submitReceipt({
      orderNo: order.orderNo,
      userId: 'u-types',
      file: pngFile(MAX_RECEIPT_BYTES + 1),
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'RECEIPT_REQUIRED'
  );

  // Nothing was stored, so the order is still waiting for payment.
  const [detail] = await db()
    .select()
    .from(schema.manualPaymentDetail)
    .where(eq(schema.manualPaymentDetail.orderId, order.orderId));
  assert.equal(detail.status, 'pending_payment');
  assert.equal(detail.receiptKey, null);
});

test('an expired order refuses a receipt', async () => {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const order = await makeOrder('u-expired', past);
  await assert.rejects(
    submitReceipt({
      orderNo: order.orderNo,
      userId: 'u-expired',
      file: pngFile(),
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'ORDER_NOT_PAYABLE'
  );
});
