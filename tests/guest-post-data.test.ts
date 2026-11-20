import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dialects = ['sqlite', 'postgres', 'mysql'] as const;

test('no schema template declares the guest_post table', () => {
  for (const d of dialects) {
    const src = read(`src/config/db/schema.${d}.ts`);
    assert.ok(!src.includes("'guest_post'"), d);
    assert.ok(!src.includes('guestPost'), d);
  }
});

test('the pricing catalog has no guest-post packages', async () => {
  const { pricingCatalog } = await import('../src/config/pricing');
  const kinds = Object.values(pricingCatalog).map((p: any) => p.kind);
  assert.ok(!kinds.includes('guest_post'));
});

test('no message key mentions guest posts', () => {
  const keys = Object.keys(JSON.parse(read('messages/en.json')));
  assert.deepEqual(
    keys.filter((k) => /guest.?post/i.test(k)),
    []
  );
});

test('RBAC seeds no guest-post permission codes', () => {
  const seeds = read('scripts/init-rbac.ts');
  assert.ok(!seeds.includes('admin.guest-posts'));
});
