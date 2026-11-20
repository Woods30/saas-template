import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('public config no longer advertises guest-post switches', () => {
  const settings = read('src/modules/config/settings.ts');
  assert.ok(!settings.includes('guest_post_enabled'));
  assert.ok(!settings.includes('guest_post_min_words'));
  assert.ok(!settings.includes('notify_guest_post_enabled'));
});

test('the admin agent surface no longer exposes guest-post operations', () => {
  const ops = read('src/lib/admin-operations.ts');
  assert.ok(!ops.includes('guest_posts_list'));
  assert.ok(!ops.includes('admin.guest-posts'));
});

test('the public blog can only surface article rows', async () => {
  const { PUBLIC_BLOG_TYPES } = await import('../src/modules/posts/service');
  assert.deepEqual([...PUBLIC_BLOG_TYPES], ['article']);
});
