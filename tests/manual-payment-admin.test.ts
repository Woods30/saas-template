import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(join(tmpdir(), 'saas-template-mp-admin-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_tq9hv3bz}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_cy4np7dm}}',
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
const { executeAdmin, findOperation } =
  await import('../src/server/admin/execute');
const { adminOperations } = await import('../src/lib/admin-operations');
const { createAccount, createManualOrder, submitReceipt } =
  await import('../src/modules/manual-payments/service');

const reader = { userId: 'admin-reader', permissions: ['admin.payments.read'] };
const writer = {
  userId: 'admin-writer',
  permissions: ['admin.payments.write'],
};
const outsider = { userId: 'user-1', permissions: ['admin.users.read'] };

const product = {
  productId: 'mp_admin_pack',
  productName: 'Pack',
  planName: 'Pack',
  description: 'Pack',
  type: PaymentType.ONE_TIME,
  priceInCents: 9900,
  currency: 'usd',
  cnyPriceInCents: 69900,
  credits: 10,
  creditsValidDays: 0,
};

async function makePendingOrder(userId: string) {
  await db()
    .insert(schema.user)
    .values({ id: userId, name: userId, email: `${userId}@example.com` })
    .onConflictDoNothing();
  const created = await createManualOrder({ userId, product });
  await submitReceipt({
    orderNo: created.orderNo,
    userId,
    file: new File([new Uint8Array(16).fill(3)], 'r.png', {
      type: 'image/png',
    }),
  });
  return created;
}

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('the operations are registered with payments permissions', () => {
  const names = adminOperations.map((o) => o.name);
  for (const name of [
    'manual_accounts_list',
    'manual_account_create',
    'manual_account_update',
    'manual_account_delete',
    'manual_orders_list',
    'manual_order_review',
    'manual_order_refund',
  ]) {
    assert.ok(names.includes(name), name);
  }
  const read = findOperation('manual_accounts_list');
  const write = findOperation('manual_order_review');
  assert.equal(read.permission, 'admin.payments.read');
  assert.equal(write.permission, 'admin.payments.write');
});

test('actors without payments.read are refused', async () => {
  await assert.rejects(
    () => executeAdmin(findOperation('manual_accounts_list'), {}, outsider),
    /Forbidden/
  );
  await assert.rejects(
    () =>
      executeAdmin(
        findOperation('manual_orders_list'),
        {},
        { userId: 'r', permissions: ['admin.users.read'] }
      ),
    /Forbidden/
  );
  // A read-only actor cannot review.
  await assert.rejects(
    () =>
      executeAdmin(
        findOperation('manual_order_review'),
        { orderNo: 'ORD-x', action: 'approve' },
        reader
      ),
    /Forbidden/
  );
});

test('accounts can be listed, created, updated and deleted through the API', async () => {
  const created = await executeAdmin(
    findOperation('manual_account_create'),
    {
      displayName: 'Operator Zhang',
      channel: 'alipay',
      currency: 'cny',
      qrImageKey: 'https://example.com/qr.png',
      enabled: true,
    },
    writer,
    'idem-account-create-1'
  );
  assert.equal(created.status, 200);
  const { data: account } = await created.json();
  assert.ok(account.id);

  const listed = await executeAdmin(
    findOperation('manual_accounts_list'),
    {},
    reader
  );
  const { data: accounts } = await listed.json();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].displayName, 'Operator Zhang');
  assert.equal(accounts[0].enabled, true);

  await executeAdmin(
    findOperation('manual_account_update'),
    { id: account.id, enabled: false, displayName: 'Zhang (off)' },
    writer,
    'idem-account-update-1'
  );
  const afterUpdate = await (
    await executeAdmin(findOperation('manual_accounts_list'), {}, reader)
  ).json();
  assert.equal(afterUpdate.data[0].enabled, false);
  assert.equal(afterUpdate.data[0].displayName, 'Zhang (off)');

  await executeAdmin(
    findOperation('manual_account_update'),
    { id: account.id, enabled: true },
    writer,
    'idem-account-update-2'
  );

  // Delete a throwaway account: the one above stays for the order tests.
  const tempResponse = await executeAdmin(
    findOperation('manual_account_create'),
    { displayName: 'Temp', currency: 'cny' },
    writer,
    'idem-account-create-2'
  );
  const { data: temp } = await tempResponse.json();
  await executeAdmin(
    findOperation('manual_account_delete'),
    { id: temp.id },
    writer,
    'idem-account-delete-1'
  );
  const afterDelete = await (
    await executeAdmin(findOperation('manual_accounts_list'), {}, reader)
  ).json();
  assert.equal(
    afterDelete.data.some((row: { id: string }) => row.id === temp.id),
    false
  );
  assert.equal(
    afterDelete.data.some((row: { id: string }) => row.id === account.id),
    true
  );
});

test('orders are listed with their detail and approved through the API', async () => {
  await saveConfigs({ manual_payments_enabled: 'true' });
  const created = await makePendingOrder('u-api');

  const listed = await executeAdmin(
    findOperation('manual_orders_list'),
    { status: 'pending_verification' },
    reader
  );
  assert.equal(listed.status, 200);
  const { data: page } = await listed.json();
  const row = page.items.find(
    (item: { orderNo: string }) => item.orderNo === created.orderNo
  );
  assert.ok(row);
  assert.equal(row.detail.status, 'pending_verification');
  assert.equal(row.detail.fingerprint, created.payableAmount - 69900);

  const reviewed = await executeAdmin(
    findOperation('manual_order_review'),
    {
      orderNo: created.orderNo,
      action: 'approve',
      observedAmount: created.payableAmount,
      externalReference: 'ALI-API-1',
    },
    writer,
    'idem-review-approve-1'
  );
  assert.equal(reviewed.status, 200);

  const [orderRow] = await db()
    .select({ status: schema.order.status })
    .from(schema.order)
    .where(eq(schema.order.id, created.orderId));
  assert.equal(orderRow.status, 'paid');

  const [detail] = await db()
    .select({ status: schema.manualPaymentDetail.status })
    .from(schema.manualPaymentDetail)
    .where(eq(schema.manualPaymentDetail.orderId, created.orderId));
  assert.equal(detail.status, 'settled');
});

test('rejecting or approving as an exception requires a note', async () => {
  const created = await makePendingOrder('u-api-note');

  const rejectedWithoutNote = await executeAdmin(
    findOperation('manual_order_review'),
    { orderNo: created.orderNo, action: 'reject' },
    writer,
    'idem-review-note-1'
  );
  assert.equal(rejectedWithoutNote.status, 400);

  const exceptionWithoutNote = await executeAdmin(
    findOperation('manual_order_review'),
    {
      orderNo: created.orderNo,
      action: 'approve_exception',
      observedAmount: created.payableAmount,
    },
    writer,
    'idem-review-note-2'
  );
  assert.equal(exceptionWithoutNote.status, 400);

  // A plain approval still needs no note.
  const plain = await executeAdmin(
    findOperation('manual_order_review'),
    {
      orderNo: created.orderNo,
      action: 'approve',
      observedAmount: created.payableAmount,
    },
    writer,
    'idem-review-note-3'
  );
  assert.equal(plain.status, 200);
});

test('review rejects a bad amount and refund closes the order', async () => {
  const created = await makePendingOrder('u-api-refund');

  const mismatch = await executeAdmin(
    findOperation('manual_order_review'),
    {
      orderNo: created.orderNo,
      action: 'approve',
      observedAmount: created.payableAmount + 5,
    },
    writer,
    'idem-review-mismatch-1'
  );
  assert.equal(mismatch.status, 400);

  await executeAdmin(
    findOperation('manual_order_review'),
    {
      orderNo: created.orderNo,
      action: 'approve',
      observedAmount: created.payableAmount,
    },
    writer,
    'idem-review-ok-1'
  );
  const refunded = await executeAdmin(
    findOperation('manual_order_refund'),
    { orderNo: created.orderNo, reviewNote: 'returned' },
    writer,
    'idem-refund-1'
  );
  assert.equal(refunded.status, 200);

  const [orderRow] = await db()
    .select({ status: schema.order.status })
    .from(schema.order)
    .where(eq(schema.order.id, created.orderId));
  assert.equal(orderRow.status, 'refunded');
});
