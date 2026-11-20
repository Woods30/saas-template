import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Isolated SQLite database; no application modules load before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-config-test-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: '{{SECRET_tm8vq2ca}}',
  CONFIG_ENCRYPTION_KEY: '{{SECRET_yfq6md3p}}',
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

const { PUBLIC_CONFIG_KEYS } =
  await import('../src/modules/config/public-keys');
const {
  filterPublicConfigs,
  getAdminConfigs,
  getAllConfigs,
  isSecretConfigKey,
  saveConfigs,
} = await import('../src/modules/config/service');

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('public allowlist contains no secret-like key', () => {
  for (const key of PUBLIC_CONFIG_KEYS) {
    assert.equal(isSecretConfigKey(key), false, key);
  }
});

test('public filter drops secret and protected keys even when allowlisted', () => {
  const out = filterPublicConfigs(
    {
      app_name: 'A',
      stripe_secret_key: 'not-a-real-secret',
      auth_secret: 'not-a-real-secret',
    },
    ['app_name', 'stripe_secret_key', 'auth_secret']
  );
  assert.deepEqual(out, { app_name: 'A' });
});

test('admin view masks secrets and removes protected keys', async () => {
  await saveConfigs({
    stripe_secret_key: 'not-a-real-secret',
    auth_secret: 'nope',
  });
  const admin = await getAdminConfigs();
  assert.match(admin.stripe_secret_key, /^••••••••/);
  assert.equal('auth_secret' in admin, false);
});

test('saving with a masked value keeps the stored secret unchanged', async () => {
  await saveConfigs({ stripe_secret_key: 'not-a-real-secret' });
  const masked = (await getAdminConfigs()).stripe_secret_key;
  assert.ok(masked.startsWith('••••••••'));
  await saveConfigs({ stripe_secret_key: masked });
  const stored = await getAllConfigs();
  assert.equal(stored.stripe_secret_key, 'not-a-real-secret');
});
