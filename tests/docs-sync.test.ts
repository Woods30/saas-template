import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// The upgrade note names the table a migration drops, which is the one place
// the old feature has to be spelled out. Everything else must not advertise it.
const readmeWithoutUpgradeNote = () =>
  read('README.md').replace(
    /^## Upgrading from an earlier version[\s\S]*?(?=^## )/m,
    ''
  );

test('the docs do not mention guest posts or prettier', () => {
  const docs: Array<[string, string]> = [
    ['AGENTS.md', read('AGENTS.md')],
    ['README.md', readmeWithoutUpgradeNote()],
  ];
  for (const [name, text] of docs) {
    assert.ok(!/guest.?post/i.test(text), `${name} still mentions guest posts`);
    assert.ok(!/prettier/i.test(text), `${name} still mentions prettier`);
    assert.ok(!/\/blog\/write-for-us/i.test(text), name);
  }
});

test('AGENTS.md documents the real command surface', () => {
  const text = read('AGENTS.md');
  assert.match(text, /pnpm format/);
  assert.match(text, /biome/i);
  assert.ok(
    !text.includes('admin.operations.read') || text.includes('/admin/analytics')
  );
});
