import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(join(tmpdir(), 'shipany-footer-badges-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: 'isolated-footer-badges-test-secret-not-a-real-credential',
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
const { config, user } = await import('../src/config/db/schema');
const { getStoredFooterBadges, saveStoredFooterBadges } =
  await import('../src/modules/footer-badges/service');
const { parseStoredFooterBadges, validateFooterBadges } =
  await import('../src/features/footer-badges/validation');
const { executeAdmin, findOperation, runAdminRoute } =
  await import('../src/server/admin/execute');
const { saveConfigs, getCustomConfigs, replaceCustomConfigs } =
  await import('../src/modules/config/service');
const { checkSessionOrigin } = await import('../src/server/admin/auth');

const badge = {
  href: 'https://example.test/listing',
  src: 'https://example.test/badge.svg',
  alt: 'Example badge',
  width: 250,
};
for (const id of ['boss', 'ordinary', 'delegated']) {
  await db()
    .insert(user)
    .values({ id, name: id, email: `${id}@example.test` });
}
const boss = { userId: 'boss', permissions: ['*'] };
const call = (name: string, input: unknown, actor = boss) =>
  executeAdmin(findOperation(name), input, actor);
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('concurrent first saves upsert one complete config row', async () => {
  assert.equal(await getStoredFooterBadges(), undefined);
  const first = JSON.stringify([badge]);
  const second = JSON.stringify([{ ...badge, alt: 'Second badge' }]);
  await Promise.all([
    saveStoredFooterBadges(first),
    saveStoredFooterBadges(second),
  ]);
  const rows = await db()
    .select()
    .from(config)
    .where(eq(config.name, 'footer_badges'));
  assert.equal(rows.length, 1);
  assert.ok([first, second].includes(rows[0].value!));
});

test('super administrators can read and save badges through the admin boundary', async () => {
  globalThis.__minIntervalRateLimitStore?.clear();
  const saved = await call('footer_badges_update', { badges: [badge] });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).code, 0);
  const loaded = await call('footer_badges_get', {});
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).data[0].alt, badge.alt);
});

test('ordinary admin wildcards and explicitly delegated codes cannot grant access', async () => {
  const before = await getStoredFooterBadges();
  for (const actor of [
    { userId: 'ordinary', permissions: ['admin.*'] },
    {
      userId: 'delegated',
      permissions: [
        'admin.access',
        'admin.footer-badges.read',
        'admin.footer-badges.write',
      ],
    },
  ]) {
    assert.equal((await call('footer_badges_get', {}, actor)).status, 403);
    assert.equal(
      (await call('footer_badges_update', { badges: [] }, actor)).status,
      403
    );
  }
  assert.equal(await getStoredFooterBadges(), before);
});

test('anonymous access and cross-origin session writes are refused', async () => {
  const response = await runAdminRoute('footer_badges_get', {
    request: new Request('http://localhost:3000/api/admin/footer-badges'),
  });
  assert.equal(response.status, 401);
  assert.throws(
    () =>
      checkSessionOrigin(
        new Request('http://localhost:3000/api/admin/footer-badges', {
          method: 'POST',
          headers: { origin: 'https://other.test' },
        }),
        boss
      ),
    /Same-origin/
  );
});

test('invalid URLs and oversized payloads are rejected without changing stored badges', async () => {
  const before = await getStoredFooterBadges();
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,bad',
    'http://example.test',
    'https://user:pass@example.test',
  ]) {
    assert.throws(() => validateFooterBadges([{ ...badge, href }]), /HTTPS/);
  }
  assert.throws(() => validateFooterBadges(Array(201).fill(badge)), /maximum/);
  assert.throws(
    () => validateFooterBadges([{ ...badge, width: -1 }]),
    /positive integer/
  );
  globalThis.__minIntervalRateLimitStore?.clear();
  assert.equal(
    (
      await call('footer_badges_update', {
        badges: [{ ...badge, src: 'javascript:alert(1)' }],
      })
    ).status,
    400
  );
  assert.equal(await getStoredFooterBadges(), before);
  assert.deepEqual(parseStoredFooterBadges('broken JSON'), []);
});

test('general and custom settings cannot overwrite or remove module-managed badges', async () => {
  const before = await getStoredFooterBadges();
  await saveConfigs({ footer_badges: '[]' });
  assert.equal(await getStoredFooterBadges(), before);
  assert.ok(
    !(await getCustomConfigs()).some(({ key }) => key === 'footer_badges')
  );
  await replaceCustomConfigs([]);
  assert.equal(await getStoredFooterBadges(), before);
  await assert.rejects(
    replaceCustomConfigs([{ key: 'footer_badges', value: '[]' }]),
    /Reserved key/
  );
});

test('saving an empty list removes every badge and stays empty on reload', async () => {
  globalThis.__minIntervalRateLimitStore?.clear();
  assert.equal(
    (await call('footer_badges_update', { badges: [] })).status,
    200
  );
  assert.deepEqual(parseStoredFooterBadges(await getStoredFooterBadges()), []);
});
