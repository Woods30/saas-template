import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';

// Isolated SQLite DB; no application modules load before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-manual-orders-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_mk4p9ra}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_pq8zu2xe}}',
  NODE_ENV: 'test',
  VITE_APP_URL: 'http://localhost:3000',
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
  MANUAL_PAYMENT_PROVIDER,
  MANUAL_PAYMENT_TTL_MS,
  ManualPaymentError,
  createManualOrder,
  createAccount,
  listEnabledAccounts,
  updateAccount,
  deleteAccount,
} = await import('../src/modules/manual-payments/service');

let seq = 0;

async function ensureUser(userId: string) {
  await db()
    .insert(schema.user)
    .values({ id: userId, name: userId, email: `${userId}@example.com` })
    .onConflictDoNothing();
}

const oneTimeProduct = {
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

before(async () => {
  await saveConfigs({ manual_payments_enabled: 'true' });
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('account CRUD keeps disabled accounts out of the payer list', async () => {
  const created = await createAccount({
    channel: 'alipay',
    displayName: 'Alice',
    currency: 'cny',
    qrImageKey: 'https://example.com/alice.png',
  });
  assert.equal((await listEnabledAccounts()).length, 0);

  await updateAccount(created.id, { enabled: true, sortOrder: 2 });
  const enabled = await listEnabledAccounts();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].displayName, 'Alice');

  await deleteAccount(created.id);
  assert.equal((await listEnabledAccounts()).length, 0);
});

test('orders are refused while the module is off', async () => {
  await saveConfigs({ manual_payments_enabled: 'false' });
  await assert.rejects(
    createManualOrder({ userId: 'u-disabled', product: oneTimeProduct }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'MODULE_DISABLED'
  );
  await saveConfigs({ manual_payments_enabled: 'true' });
});

test('subscriptions and non-CNY products are not sellable this way', async () => {
  await assert.rejects(
    createManualOrder({
      userId: 'u-sub',
      product: { ...oneTimeProduct, type: PaymentType.SUBSCRIPTION },
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'INVALID_OFFER'
  );
  await assert.rejects(
    createManualOrder({
      userId: 'u-nocny',
      product: { ...oneTimeProduct, cnyPriceInCents: undefined },
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'INVALID_OFFER'
  );
});

test('an enabled account is required', async () => {
  const previous = await db()
    .select()
    .from(schema.manualPaymentAccount)
    .where(eq(schema.manualPaymentAccount.enabled, true));
  for (const account of previous) {
    await db()
      .update(schema.manualPaymentAccount)
      .set({ enabled: false })
      .where(eq(schema.manualPaymentAccount.id, account.id));
  }
  await assert.rejects(
    createManualOrder({ userId: 'u-noacct', product: oneTimeProduct }),
    (error: unknown) =>
      error instanceof ManualPaymentError &&
      error.code === 'NO_MANUAL_PAYMENT_ACCOUNT'
  );
});

test('three orders get distinct fingerprints and a 15-minute TTL', async () => {
  await createAccount({
    channel: 'alipay',
    displayName: 'Bob',
    currency: 'cny',
    qrImageKey: 'https://example.com/bob.png',
    enabled: true,
  });
  const now = new Date('2026-11-20T10:00:00Z');
  const orders = [];
  for (let i = 0; i < 3; i++) {
    await ensureUser(`u-buyer-${i}`);
    orders.push(
      await createManualOrder({
        userId: `u-buyer-${i}`,
        product: oneTimeProduct,
        now,
      })
    );
  }

  const fingerprints = orders.map((o) => o.payableAmount - 69900);
  assert.equal(new Set(fingerprints).size, 3);
  for (const fingerprint of fingerprints) {
    assert.ok(fingerprint >= 1 && fingerprint <= 99, String(fingerprint));
  }
  for (const order of orders) {
    assert.equal(order.currency, 'cny');
    assert.equal(
      order.expiresAt.getTime(),
      now.getTime() + MANUAL_PAYMENT_TTL_MS
    );
    assert.equal(order.qrImageUrl, 'https://example.com/bob.png');
  }

  const stored = await db()
    .select()
    .from(schema.order)
    .where(
      inArray(
        schema.order.orderNo,
        orders.map((o) => o.orderNo)
      )
    );
  assert.equal(stored.length, 3);
  assert.ok(
    stored.every(
      (row: { paymentProvider: string }) =>
        row.paymentProvider === MANUAL_PAYMENT_PROVIDER
    )
  );
  assert.ok(
    stored.every((row: { status: string }) => row.status === 'created')
  );
});

test('the 100th live order on one account hits AMOUNT_POOL_EXHAUSTED', async () => {
  const [account] = await listEnabledAccounts();
  await ensureUser('u-pool');
  const now = new Date();

  // Earlier tests left live orders holding some amounts; close them so this
  // test starts from an empty pool.
  await db()
    .update(schema.manualPaymentDetail)
    .set({ status: 'expired' })
    .where(eq(schema.manualPaymentDetail.accountId, account.id));

  const poolOrderIds: string[] = [];
  for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
    const orderId = `pool-${++seq}`;
    poolOrderIds.push(orderId);
    await db()
      .insert(schema.order)
      .values({
        id: orderId,
        orderNo: `POOL-${seq}`,
        userId: 'u-pool',
        status: 'created',
        amount: 69900 + fingerprint,
        currency: 'cny',
        paymentProvider: MANUAL_PAYMENT_PROVIDER,
        checkoutInfo: '{}',
        paymentType: 'one-time',
      });
    await db()
      .insert(schema.manualPaymentDetail)
      .values({
        orderId,
        userId: 'u-pool',
        accountId: account.id,
        fingerprint,
        baseAmount: 69900,
        payableAmount: 69900 + fingerprint,
        currency: 'cny',
        status: 'pending_payment',
        expiresAt: new Date(now.getTime() + MANUAL_PAYMENT_TTL_MS),
      });
  }

  await assert.rejects(
    createManualOrder({
      userId: 'u-pool',
      product: oneTimeProduct,
      accountId: account.id,
      now,
    }),
    (error: unknown) =>
      error instanceof ManualPaymentError &&
      error.code === 'AMOUNT_POOL_EXHAUSTED'
  );

  // Expiring the stale rows hands the amounts back.
  const { expireStaleOrders } =
    await import('../src/modules/manual-payments/service');
  const expired = await expireStaleOrders(
    account.id,
    new Date(now.getTime() + MANUAL_PAYMENT_TTL_MS + 1)
  );
  assert.equal(expired, 99);
  const again = await createManualOrder({
    userId: 'u-pool',
    product: oneTimeProduct,
    accountId: account.id,
  });
  assert.ok(again.payableAmount - 69900 >= 1);

  const expiredRows = await db()
    .select({ status: schema.manualPaymentDetail.status })
    .from(schema.manualPaymentDetail)
    .where(inArray(schema.manualPaymentDetail.orderId, poolOrderIds));
  assert.equal(expiredRows.length, 99);
  assert.ok(
    expiredRows.every((row: { status: string }) => row.status === 'expired')
  );
});
