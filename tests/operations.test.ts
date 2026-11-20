import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(join(tmpdir(), 'shipany-operations-test-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: 'isolated-operations-test-not-a-real-secret',
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
const operations = await import('../src/modules/operations/service');
const { sameTimeWindows, formatOperationsMoney } =
  await import('../src/lib/operations');
const { readVisitorCookie, signVisitor } =
  await import('../src/lib/operations-cookie');
const { executeAdmin, findOperation } =
  await import('../src/server/admin/execute');
const { Route: visitRoute } =
  await import('../src/routes/api/operations/visit');
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('comparison uses yesterday at the same local time, including midnight', () => {
  const w = sameTimeWindows(new Date('2026-11-02T04:30:00Z'));
  assert.equal(w.todayFrom.toISOString(), '2026-11-01T16:00:00.000Z');
  assert.equal(w.yesterdayFrom.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(w.yesterdayTo.toISOString(), '2026-11-01T04:30:00.000Z');
  assert.equal(formatOperationsMoney(1200, 'jpy', 'en'), '¥1,200');
  assert.equal(formatOperationsMoney(1200, 'usd', 'en'), '$12.00');
});

test('signed visitor IDs reject forged cookies', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    readVisitorCookie(
      new Headers({ cookie: `ops_visitor=${signVisitor(id)}` })
    ),
    id
  );
  assert.equal(
    readVisitorCookie(
      new Headers({ cookie: `ops_visitor=${id}.${'0'.repeat(64)}` })
    ),
    null
  );
});

test('first-touch cohort and account claims remain immutable across return visits and concurrent logins', async () => {
  await db()
    .insert(schema.user)
    .values([
      { id: 'link-a', name: 'A', email: 'link-a@example.test' },
      { id: 'link-b', name: 'B', email: 'link-b@example.test' },
    ]);
  await operations.recordVisitor({
    id: 'claim',
    userId: null,
    source: 'chatgpt.com',
    country: 'US',
    entryPath: '/pricing',
    buildId: 'v1',
    excluded: false,
  });
  await Promise.all([
    operations.linkVisitor('claim', 'link-a'),
    operations.linkVisitor('claim', 'link-b'),
  ]);
  const [claimed] = await db()
    .select()
    .from(schema.analyticsVisitor)
    .where(eq(schema.analyticsVisitor.id, 'claim'));
  await operations.recordVisitor({
    id: 'claim',
    userId: 'link-b',
    source: 'google.com',
    country: 'GB',
    entryPath: '/',
    buildId: 'v2',
    excluded: false,
  });
  const [returned] = await db()
    .select()
    .from(schema.analyticsVisitor)
    .where(eq(schema.analyticsVisitor.id, 'claim'));
  assert.equal(returned.userId, claimed.userId);
  assert.equal(returned.source, 'chatgpt.com');
  assert.equal(returned.buildId, 'v1');
  assert.equal(returned.country, 'US');
  await db()
    .update(schema.analyticsVisitor)
    .set({ excluded: true })
    .where(eq(schema.analyticsVisitor.id, 'claim'));
});

test('real payment metrics, refunds, unique cohorts, staff exclusion and daily boundaries', async () => {
  const now = new Date('2026-11-02T04:30:00Z');
  const visitAt = new Date('2026-11-01T17:00:00Z');
  const signupAt = new Date('2026-11-01T17:10:00Z');
  const paidAt = new Date('2026-11-02T01:00:00Z');
  for (const id of ['buyer', 'staff', 'api', 'tester', 'yesterday'])
    await db()
      .insert(schema.user)
      .values({
        id,
        name: id,
        email: `${id}@example.test`,
        type: id === 'api' ? 'api' : 'user',
        createdAt: signupAt,
      });
  await db().insert(schema.role).values({
    id: 'staff-role',
    name: 'custom-staff',
    title: 'Staff',
    status: 'active',
  });
  await db().insert(schema.permission).values({
    id: 'access',
    code: 'admin.access',
    resource: 'admin',
    action: 'access',
    title: 'Admin access',
  });
  await db().insert(schema.rolePermission).values({
    id: 'staff-permission',
    roleId: 'staff-role',
    permissionId: 'access',
  });
  await db()
    .insert(schema.userRole)
    .values({ id: 'staff-role-link', roleId: 'staff-role', userId: 'staff' });
  for (const id of ['buyer', 'staff', 'api', 'tester'])
    await db()
      .insert(schema.analyticsVisitor)
      .values({
        id: `visitor-${id}`,
        userId: id,
        source: 'chatgpt.com',
        country: 'US',
        entryPath: '/',
        buildId: 'v1',
        excluded: id === 'tester',
        createdAt: visitAt,
      });
  await db()
    .insert(schema.analyticsVisitor)
    .values([
      { id: 'anonymous', source: 'google.com', createdAt: visitAt },
      {
        id: 'duplicate-browser',
        userId: 'buyer',
        source: 'google.com',
        createdAt: new Date('2026-11-01T17:05:00Z'),
      },
    ]);
  async function addOrder(
    id: string,
    userId: string,
    amount: number,
    options: Record<string, unknown> = {}
  ) {
    await db()
      .insert(schema.order)
      .values({
        id,
        orderNo: id,
        userId,
        userEmail: `${userId}@example.test`,
        status: 'paid',
        amount,
        currency: 'usd',
        paymentProvider: 'stripe',
        checkoutInfo: '{}',
        createdAt: signupAt,
        paidAt,
        ...options,
      });
  }
  await addOrder('paid', 'buyer', 1200, {
    paymentAmount: 1000,
    refundAmount: 200,
  });
  await addOrder('jpy', 'buyer', 1200, {
    currency: 'jpy',
    status: 'refunded',
    refundAmount: 100,
  });
  await addOrder('renewal', 'buyer', 500, { paymentType: 'renew' });
  await addOrder('pending', 'buyer', 1200, { status: 'pending', paidAt: null });
  for (const id of ['staff', 'api', 'tester'])
    await addOrder(`excluded-${id}`, id, 999999);
  await addOrder('yesterday-early', 'yesterday', 300, {
    paidAt: new Date('2026-11-01T01:00:00Z'),
  });
  await addOrder('yesterday-late', 'yesterday', 900, {
    paidAt: new Date('2026-11-01T05:00:00Z'),
  });
  await db().insert(schema.aiTask).values({
    id: 'task',
    userId: 'buyer',
    mediaType: 'video',
    provider: 'test',
    model: 'test',
    prompt: 'test',
    status: 'success',
    createdAt: signupAt,
  });
  await db()
    .insert(schema.userEvent)
    .values([
      {
        id: 'select1',
        userId: 'buyer',
        kind: 'plan_selected',
        source: 'client',
        createdAt: signupAt,
      },
      {
        id: 'select2',
        userId: 'buyer',
        kind: 'plan_selected',
        source: 'client',
        createdAt: signupAt,
      },
    ]);
  const report = await operations.getOperationsReport({ now });
  assert.equal(report.today.orders, 3);
  assert.equal(report.today.payers, 1);
  assert.deepEqual(
    report.today.revenue.find((r) => r.currency === 'usd'),
    { currency: 'usd', amount: 1300 }
  );
  assert.deepEqual(
    report.today.revenue.find((r) => r.currency === 'jpy'),
    { currency: 'jpy', amount: 1100 }
  );
  assert.equal(
    report.yesterday.orders,
    1,
    'exclude yesterday payments after the matching clock time'
  );
  assert.equal(report.unpaid24h, 1);
  assert.equal(
    report.totals.visitors,
    2,
    'staff, API, tests and a second browser are excluded'
  );
  assert.equal(report.totals.signups, 1);
  assert.equal(
    report.totals.selected,
    1,
    'repeated clicks do not inflate the funnel'
  );
  assert.equal(report.totals.active, 1);
  assert.equal(report.totals.checkouts, 1);
  assert.equal(report.totals.paid, 1);
  assert.equal(
    report.totals.revenue.find((r) => r.currency === 'usd')?.amount,
    800,
    'cohort revenue excludes renewals'
  );
  assert.equal(report.days.at(-1)?.orders, 3);
  assert.equal(report.days.at(-1)?.day, '2026-11-02');
});

test('admin operations require dedicated permissions; concurrent conclusions cannot overwrite', async () => {
  const operation = findOperation('operations_experiments_create');
  const input = {
    title: 'A focused experiment',
    observation: 'Checkout drop-off',
    hypothesis: 'Clearer copy helps',
    change: 'Compare two descriptions',
    buildId: 'abc',
    sampleTarget: 400,
  };
  await assert.rejects(
    () =>
      executeAdmin(operation, input, {
        userId: 'buyer',
        permissions: ['admin.payments.read'],
      }),
    /Forbidden/
  );
  await assert.rejects(
    () =>
      executeAdmin(
        findOperation('operations_report'),
        {},
        { userId: 'buyer', permissions: ['admin.users.read'] }
      ),
    /Forbidden/
  );
  const response = await executeAdmin(operation, input, {
    userId: 'buyer',
    permissions: ['admin.operations.write'],
  });
  assert.equal(response.status, 200);
  const { data: entry } = await response.json();
  const conclusions = await Promise.all([
    operations.concludeExperiment({
      id: entry.id,
      status: 'completed',
      result: 'A won',
    }),
    operations.concludeExperiment({
      id: entry.id,
      status: 'stopped',
      result: 'Insufficient evidence',
    }),
  ]);
  assert.equal(conclusions.filter(Boolean).length, 1);
  await assert.rejects(() =>
    executeAdmin(
      findOperation('operations_experiments_conclude'),
      { id: entry.id, status: 'completed', result: '' },
      { userId: 'buyer', permissions: ['admin.operations.write'] }
    )
  );
});

test('visitor endpoint rejects cross-origin requests and forged user IDs; consent stops collection', async () => {
  const post = (
    visitRoute.options.server!.handlers as unknown as {
      POST: (ctx: { request: Request }) => Promise<Response>;
    }
  ).POST;
  const make = (body: unknown, headers: Record<string, string>) =>
    post({
      request: new Request('http://localhost:3000/api/operations/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    });
  assert.equal(
    (await make({ path: '/', referrer: '' }, { origin: 'https://evil.test' }))
      .status,
    403
  );
  assert.equal(
    (
      await make(
        { path: '/', referrer: '', userId: 'buyer' },
        { origin: 'http://localhost:3000', 'x-real-ip': '192.0.2.1' }
      )
    ).status,
    400
  );
  const response = await make(
    { path: '/', referrer: '' },
    {
      origin: 'http://localhost:3000',
      cookie: 'cookie_consent=rejected',
      'x-real-ip': '192.0.2.2',
    }
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const tracked = await make(
    { path: '/pricing', referrer: 'https://chatgpt.com/?private=removed' },
    {
      origin: 'http://localhost:3000',
      'x-real-ip': '192.0.2.3',
      'cf-ipcountry': 'US',
    }
  );
  assert.equal(tracked.status, 200);
  const cookie = tracked.headers.get('set-cookie');
  assert.ok(cookie?.includes('HttpOnly'));
  const visitorId = readVisitorCookie(new Headers({ cookie: cookie! }));
  assert.ok(visitorId);
  const [visit] = await db()
    .select()
    .from(schema.analyticsVisitor)
    .where(eq(schema.analyticsVisitor.id, visitorId));
  assert.equal(visit.source, 'chatgpt.com');
  assert.equal(visit.country, 'US');
  assert.equal(visit.entryPath, '/pricing');
  const dnt = await make(
    { path: '/', referrer: '' },
    { origin: 'http://localhost:3000', dnt: '1', 'x-real-ip': '192.0.2.4' }
  );
  assert.equal(dnt.headers.get('set-cookie'), null);
});
