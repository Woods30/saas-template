import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Isolated SQLite database; no application module loads before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'saas-template-admin-posts-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: 'admin-posts-test-secret-not-a-real-key',
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
const { post, user } = await import('../src/config/db/schema');
const { GET } = await import('../src/server/admin/handlers/posts');

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

const userId = 'user-admin-posts-test';
await db()
  .insert(user)
  .values({ id: userId, name: 'User', email: 'admin-posts@example.test' });

await db()
  .insert(post)
  .values([
    {
      id: 'post-article',
      userId,
      slug: 'a-real-article',
      type: 'article',
      title: 'A real article',
      status: 'published',
    },
    {
      // Left behind by the retired guest-posts feature: nothing can create or
      // render this type now, but an upgraded database still holds it.
      id: 'post-legacy-guest',
      userId,
      slug: 'a-legacy-guest-post',
      type: 'guest',
      title: 'A legacy guest post',
      status: 'published',
    },
  ]);

const listPosts = async () => {
  const response = await GET({
    request: new Request('http://localhost/api/admin/posts?page=1&pageSize=20'),
    params: {},
    actor: { userId: 'admin', permissions: ['*'] },
  });
  return response.json();
};

test('the admin post list hides rows left by the retired guest-posts feature', async () => {
  const body = await listPosts();
  const slugs = body.data.items.map((item: { slug: string }) => item.slug);

  assert.deepEqual(slugs, ['a-real-article']);
});

test('the admin post count excludes the retired rows', async () => {
  const body = await listPosts();

  assert.equal(body.data.total, 1);
});
