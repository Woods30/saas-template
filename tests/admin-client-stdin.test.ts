import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// `readFile('/dev/stdin')` works on a developer's machine and fails with
// ENXIO inside the containers CI runs in, so it turns a green local suite red
// on every push. Consume process.stdin instead: it behaves the same whether
// stdin is a pipe, a file or a terminal.
test('the admin client reads stdin as a stream, not as /dev/stdin', () => {
  const source = read('scripts/admin-client.mjs');

  assert.ok(
    !source.includes('/dev/stdin'),
    'admin-client.mjs reads /dev/stdin, which is unavailable in CI containers'
  );
});
