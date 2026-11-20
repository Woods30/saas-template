import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

// Isolated SQLite DB; no application modules load before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-manual-schema-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_hd2kq7wa}}',
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

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

let seq = 0;

async function ensureUser(userId: string) {
  const existing = await db()
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (existing.length > 0) return;
  await db()
    .insert(schema.user)
    .values({ id: userId, name: userId, email: `${userId}@example.com` });
}

async function ensureAccount(accountId: string) {
  const existing = await db()
    .select({ id: schema.manualPaymentAccount.id })
    .from(schema.manualPaymentAccount)
    .where(eq(schema.manualPaymentAccount.id, accountId));
  if (existing.length > 0) return;
  await db().insert(schema.manualPaymentAccount).values({
    id: accountId,
    channel: 'alipay',
    displayName: accountId,
    currency: 'cny',
  });
}

async function insertDetail(
  values: Partial<typeof schema.manualPaymentDetail.$inferInsert> = {}
) {
  const orderId = `mp-${++seq}`;
  await ensureUser(values.userId ?? `user-${seq}`);
  await ensureAccount(values.accountId ?? 'a');
  await db()
    .insert(schema.order)
    .values({
      id: orderId,
      orderNo: `MP-${seq}`,
      userId: values.userId ?? `user-${seq}`,
      status: 'created',
      amount: 69900,
      currency: 'cny',
      paymentProvider: 'manual_payments',
      checkoutInfo: '{}',
      paymentType: 'one-time',
    });
  await db()
    .insert(schema.manualPaymentDetail)
    .values({
      orderId,
      userId: values.userId ?? `user-${seq}`,
      accountId: 'a',
      fingerprint: seq,
      // Distinct by default so a rejection can only come from the index the
      // test is about; tests that need a shared amount pass one explicitly.
      baseAmount: 69000 + seq,
      payableAmount: 69000 + seq,
      currency: 'cny',
      status: 'pending_payment',
      expiresAt: new Date(Date.now() + 900_000),
      ...values,
    });
  return orderId;
}

test('active amounts are unique per account, expired rows are not', async () => {
  await insertDetail({
    status: 'pending_payment',
    accountId: 'a',
    payableAmount: 69901,
  });
  await assert.rejects(
    insertDetail({
      status: 'pending_verification',
      accountId: 'a',
      payableAmount: 69901,
    })
  );
  await insertDetail({
    status: 'expired',
    accountId: 'a',
    payableAmount: 69901,
  });
  await insertDetail({
    status: 'expired',
    accountId: 'a',
    payableAmount: 69901,
  });
});

test('a user has at most one settling order', async () => {
  await insertDetail({ userId: 'u1', status: 'settling' });
  await assert.rejects(insertDetail({ userId: 'u1', status: 'settling' }));
  await insertDetail({ userId: 'u1', status: 'settled' });
});

test('the MySQL generated index columns are bounded varchar, not text', async () => {
  // MySQL refuses a UNIQUE index on a generated TEXT column (ER 1170: BLOB/TEXT
  // column used in key specification without a key length). The two keys that
  // carry the partial uniques must therefore be VARCHAR(191).
  const mysql = await import('../src/config/db/schema.mysql');
  const detail = mysql.manualPaymentDetail as unknown as Record<
    string,
    { getSQLType: () => string }
  >;
  assert.equal(detail.activeAmountKey.getSQLType(), 'varchar(191)');
  assert.equal(detail.settlingUserKey.getSQLType(), 'varchar(191)');
});

test('deleting an order removes its manual payment detail', async () => {
  const orderId = await insertDetail({ userId: 'u2' });
  await db().delete(schema.order).where(eq(schema.order.id, orderId));
  const rows = await db()
    .select({ orderId: schema.manualPaymentDetail.orderId })
    .from(schema.manualPaymentDetail);
  assert.equal(
    rows.some((row: { orderId: string }) => row.orderId === orderId),
    false
  );
});
