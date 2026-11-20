import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'saas-template-mp-config-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_xr2nt9vk}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_bw6mz1qh}}',
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

const { PUBLIC_CONFIG_KEYS } = await import(
  '../src/modules/config/public-keys'
);
const { getAllConfigs } = await import('../src/modules/config/service');
const { getSettingGroups, getSettings } = await import(
  '../src/modules/config/settings'
);
const { pricingCatalog } = await import('../src/config/pricing');
const { PaymentType } = await import('../src/core/payment/types');
const { createManualOrder, ManualPaymentError } = await import(
  '../src/modules/manual-payments/service'
);

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('the public config exposes the manual payment switch and SLA', async () => {
  assert.ok(PUBLIC_CONFIG_KEYS.includes('manual_payments_enabled'));
  assert.ok(PUBLIC_CONFIG_KEYS.includes('manual_payments_sla_hours'));

  const configs = await getAllConfigs();
  assert.equal(configs.manual_payments_enabled, 'false');
  assert.equal(configs.manual_payments_sla_hours, '24');
});

test('both manual payment settings exist in the admin settings', () => {
  const names = getSettings().map((s) => s.name);
  assert.ok(names.includes('manual_payments_enabled'));
  assert.ok(names.includes('manual_payments_sla_hours'));

  const enabled = getSettings().find(
    (s) => s.name === 'manual_payments_enabled'
  );
  assert.equal(enabled?.type, 'switch');
  assert.equal(enabled?.defaultValue, 'false');
  assert.equal(enabled?.group, 'manual_payments');

  const sla = getSettings().find((s) => s.name === 'manual_payments_sla_hours');
  assert.equal(sla?.type, 'number');
  assert.equal(sla?.defaultValue, '24');

  const groups = getSettingGroups().map((g) => g.name);
  assert.ok(groups.includes('manual_payments'));
});

test('one-time demo products carry a CNY price', () => {
  const expected: Record<string, number> = {
    starter_lifetime: 69900,
    pro_lifetime: 349900,
    enterprise_lifetime: 1399900,
  };
  for (const [productId, cny] of Object.entries(expected)) {
    const product = pricingCatalog[productId];
    assert.ok(product, productId);
    assert.equal(product.type, PaymentType.ONE_TIME, productId);
    assert.equal(product.cnyPriceInCents, cny, productId);
  }
  // Subscriptions stay off the manual rail.
  assert.equal(pricingCatalog['pro_monthly'].cnyPriceInCents, undefined);
});

test('orders are refused while the module is off', async () => {
  const product = pricingCatalog['starter_lifetime'];
  await assert.rejects(
    createManualOrder({ userId: 'u-off', product }),
    (error: unknown) =>
      error instanceof ManualPaymentError && error.code === 'MODULE_DISABLED'
  );
});
