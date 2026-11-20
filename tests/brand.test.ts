import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('LICENSE is Jerbix own text, not an upstream licence', () => {
  const license = read('LICENSE');
  assert.match(license, /Jerbix/);
  assert.match(license, /Personal/);
  assert.match(license, /Team/);
  assert.match(license, /may not (re-?sell|redistribute)/i);
  for (const upstream of ['shipany', 'Apache License', 'MIT License']) {
    assert.ok(
      !license.toLowerCase().includes(upstream.toLowerCase()),
      upstream
    );
  }
});

test('no upstream brand string survives outside the design docs', () => {
  let out = '';
  try {
    out = execFileSync(
      'git',
      // The needle itself lives in this file, so it excludes itself.
      [
        'grep',
        '-il',
        'shipany',
        '--',
        '.',
        ':!docs/superpowers',
        ':!tests/brand.test.ts',
      ],
      { encoding: 'utf8', cwd: new URL('..', import.meta.url) }
    );
  } catch (e) {
    // `git grep` exits 1 when nothing matches, which is the passing case.
    assert.equal((e as { status?: number }).status, 1, String(e));
  }
  assert.equal(out.trim(), '');
});

test('the app defaults to the Jerbix name', () => {
  assert.match(read('.env.example'), /VITE_APP_NAME=Jerbix/);
  const config = read('src/config/index.ts');
  assert.ok(!config.includes('My App'), 'placeholder app name must be gone');
  const messages = JSON.parse(read('messages/en.json'));
  assert.ok(!String(messages['common.metadata.title']).includes('My App'));
});
